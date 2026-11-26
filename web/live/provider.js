import {MODEL} from './model.js';

const fields = Object.fromEntries(MODEL.map(item => [item.name, item]));
const byId = Object.fromEntries(MODEL.map(item => [item.id, item]));
const MAX_AGE_MS = 90_000;
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 64;
const validInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
const object = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
function time(value) {
  return typeof value === 'string' && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) &&
    Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
}

export function normalizeSnapshot(raw) {
  if (!object(raw) || !object(raw.properties) || !id(raw.deviceId) ||
      !Number.isSafeInteger(raw.sequence) || raw.sequence < 0 || time(raw.reportedAt) === null) {
    throw new Error('invalid_snapshot');
  }
  const value = name => {
    const spec = fields[name];
    const item = raw.properties[spec.id];
    switch (spec.type) {
      case 'INT': return validInt(item, spec.min, spec.max) ? item : null;
      case 'ENUM': return spec.values.includes(item) ? item : null;
      case 'BOOL': return typeof item === 'boolean' ? item : null;
      case 'TEXT': return typeof item === 'string' && item.length <= spec.length ? item : null;
      default: return null;
    }
  };
  const countStatus = value('count_status');
  const reportedAt = time(raw.reportedAt);
  const boot = value('boot_session');
  const version = value('state_version');
  const pending = value('shutdown_pending');
  const task = raw.currentTask;
  const currentTask = pending === true && id(task?.id) && boot && version !== null &&
    task.bootSession === boot && task.stateVersion === version && time(task.expiresAt) !== null
    ? {id: task.id, expiresAt: time(task.expiresAt)} : null;
  return {
    deviceId: raw.deviceId, sequence: raw.sequence, reportedAt,
    platformOnline: typeof raw.platformOnline === 'boolean' ? raw.platformOnline : null,
    count: countStatus === 1 ? value('person_count') : null, countStatus,
    detection: value('door_status'), mode: value('device_mode'), boot, version,
    countdown: value('countdown_seconds'), network: value('network_status'),
    simState: raw.simFeedbackVerified === true ? value('sim_ac_state') : null,
    error: value('last_error'), pending, paused: value('paused'), currentTask,
  };
}

export function fresh(snapshot, now = Date.now()) {
  return !!snapshot && snapshot.platformOnline === true && snapshot.network === 1 &&
    snapshot.reportedAt <= now + 5_000 && now - snapshot.reportedAt <= MAX_AGE_MS;
}

export function toServiceReferences(service) {
  const map = ids => ids.map(number => {
    if (byId[number]?.kind !== 'PROPERTY') throw new Error('bad_model_reference');
    return {$ref: '#/properties/id/' + number};
  });
  return {inputData: map(service.input ?? []), outputData: map(service.output ?? [])};
}

const AIRCON_DISABLED = new Set(['confirm_shutdown']);
export function canSubmit(name, session, snapshot, now = Date.now()) {
  if (AIRCON_DISABLED.has(name) || !session?.services?.includes(name) || !session.device ||
      session.device.id !== snapshot?.deviceId || !fresh(snapshot, now) ||
      !id(snapshot.boot) || snapshot.version === null) return false;
  if (name === 'cancel_shutdown') return !!snapshot.currentTask && snapshot.currentTask.expiresAt > now;
  if (name === 'pause_control') return snapshot.paused === false;
  if (name === 'resume_control') return snapshot.paused === true && snapshot.countStatus === 1;
  if (name === 'set_device_mode') return snapshot.countStatus === 1;
  return name === 'calibrate_count' && validInt(session.device.capacity, 1, 100);
}

export function serviceRequest(name, input, session, snapshot, now, requestId) {
  if (!canSubmit(name, session, snapshot, now) || !id(requestId)) throw new Error('control_unavailable');
  const expires = Math.min(now + 30_000,
    name === 'cancel_shutdown' ? snapshot.currentTask.expiresAt : Infinity);
  const params = {
    request_id: requestId, expected_boot_session: snapshot.boot,
    expected_state_version: snapshot.version, expires_at: new Date(expires).toISOString(),
  };
  if (name === 'calibrate_count') {
    if (!validInt(input.target_count, 0, session.device.capacity)) throw new Error('invalid_count');
    params.target_count = input.target_count;
  }
  if (name === 'cancel_shutdown') params.shutdown_request_id = snapshot.currentTask.id;
  if (name === 'set_device_mode') {
    if (![0, 1].includes(input.target_mode)) throw new Error('invalid_mode');
    params.target_mode = input.target_mode;
  }
  const service = fields[name];
  return {serviceId: service.id, params: Object.fromEntries(service.input.map(number => {
    const key = byId[number].name;
    if (!(key in params)) throw new Error('invalid_service_input');
    return [key, params[key]];
  }))};
}

const RESULT_STATES = ['submitted','delivered','accepted','succeeded','failed','rejected','timeout','unknown'];

function normalizeResult(raw, requestId) {
  if (!object(raw) || raw.requestId !== requestId || !RESULT_STATES.includes(raw.status)) {
    throw new Error('invalid_result');
  }
  return {requestId, status: raw.status, message: text(raw.message, 128)};
}

// Project gateway contract. Authentication and device ACLs are enforced by the gateway.
export class QuecCloudAdapter {
  constructor(path, {fetcher = (...args) => globalThis.fetch(...args), now = Date.now, uuid = () => crypto.randomUUID()} = {}) {
    if (path && !/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(path)) throw new Error('invalid_gateway');
    this.path = path;
    this.fetcher = fetcher;
    this.now = now;
    this.uuid = uuid;
    this.session = null;
    this.snapshot = null;
    this.events = [];
    this.generation = 0;
    this.active = new Set();
    this.pending = new Map();
    this.retiredBoots = new Set();
  }

  async call(route, method = 'GET', body) {
    if (!this.path) throw new Error('unconfigured');
    const signal = new AbortController();
    this.active.add(signal);
    const timeout = setTimeout(() => signal.abort('timeout'), 8_000);
    try {
      const response = await this.fetcher(this.path + route, {
        method, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        signal: signal.signal, headers: {'Accept':'application/json', ...(body ? {'Content-Type':'application/json'} : {})},
        ...(body ? {body: JSON.stringify(body)} : {}),
      });
      if (response.status === 401 || response.status === 403) {
        this.release();
        throw new Error(response.status === 401 ? 'authentication' : 'forbidden');
      }
      if (response.status === 409) throw new Error('state_changed');
      if (response.status === 429) throw new Error('rate_limited');
      if (!response.ok) throw new Error('unavailable');
      return response.status === 204 ? null : await response.json();
    } catch (error) {
      if (signal.signal.reason === 'timeout') throw new Error('timeout');
      throw error;
    } finally {
      clearTimeout(timeout);
      this.active.delete(signal);
    }
  }

  async refresh() {
    const generation = this.generation;
    const incoming = await this.call('/session');
    if (generation !== this.generation) return null;
    if (!id(incoming?.accountId) || !id(incoming?.device?.id)) {
      this.release();
      throw new Error('authentication');
    }
    const session = {accountId: incoming.accountId, device: {
      id: incoming.device.id, label: text(incoming.device.label, 64),
      capacity: validInt(incoming.device.capacity, 1, 100) ? incoming.device.capacity : null,
    }, services: Array.isArray(incoming.services) ? incoming.services.filter(name => fields[name]?.kind === 'SERVICE') : [],
    eventsAvailable: incoming.eventsAvailable === true};
    if (this.session && (session.accountId !== this.session.accountId || session.device.id !== this.session.device.id)) {
      this.release();
      return this.refresh();
    }
    this.session = session;
    const raw = await this.call(this.devicePath('/snapshot'));
    if (generation !== this.generation) return null;
    const next = normalizeSnapshot(raw);
    if (next.deviceId !== session.device.id) {
      this.release();
      throw new Error('forbidden');
    }
    const previous = this.snapshot;
    if (this.retiredBoots.has(next.boot)) return previous;
    if (!previous || (next.sequence > previous.sequence && next.reportedAt >= previous.reportedAt &&
        (next.boot !== previous.boot || next.version === null || previous.version === null || next.version >= previous.version))) {
      if (previous?.boot && next.boot && previous.boot !== next.boot) this.retiredBoots.add(previous.boot);
      this.snapshot = next;
    }
    return this.snapshot;
  }

  devicePath(route) {
    if (!this.session) throw new Error('authentication');
    return '/devices/' + encodeURIComponent(this.session.device.id) + route;
  }

  async readEvents() {
    if (!this.session?.eventsAvailable) return null;
    const generation = this.generation;
    const raw = await this.call(this.devicePath('/events'));
    if (generation !== this.generation) return null;
    if (!Array.isArray(raw) || raw.some(item => item?.deviceId !== this.session.device.id)) {
      throw new Error('invalid_events');
    }
    const unique = new Map();
    for (const entry of raw.slice(0,100)) {
      const stamp = time(entry.at);
      const event = byId[entry.eventId];
      if (id(entry.id) && stamp !== null && event?.kind === 'EVENT') {
        unique.set(entry.id, {id: entry.id, at: stamp, kind: event.name, message: text(entry.message,128)});
      }
    }
    this.events = [...unique.values()].sort((a,b) => b.at - a.at);
    return this.events;
  }

  async submit(name, input = {}) {
    if (this.pending.size) throw new Error('busy');
    const generation = this.generation;
    const requestId = this.uuid();
    const body = serviceRequest(name, input, this.session, this.snapshot, this.now(), requestId);
    this.pending.set(name, requestId);
    try {
      return normalizeResult(await this.call(this.devicePath('/requests'), 'POST', body), requestId);
    } catch (error) {
      if (['authentication','forbidden','state_changed','rate_limited'].includes(error.message)) throw error;
      return {requestId, status:'unknown', message:''};
    } finally {
      if (generation === this.generation) this.pending.delete(name);
    }
  }

  async result(requestId) {
    if (!id(requestId)) throw new Error('invalid_request_id');
    return normalizeResult(await this.call(this.devicePath('/requests/' + encodeURIComponent(requestId))), requestId);
  }

  async logout() {
    this.release();
    try {
      await this.call('/logout', 'POST', {});
    } finally {
      this.release();
    }
  }

  release() {
    this.generation++;
    for (const controller of this.active) controller.abort();
    this.active.clear();
    this.session = null;
    this.snapshot = null;
    this.events = [];
    this.pending.clear();
    this.retiredBoots.clear();
  }
}
