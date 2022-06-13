/** @typedef {import('../types').RawValue} RawValue */

/**
 * Normalizes name of a header.
 * 
 * @param {string} name
 * @returns {string} Normalized name
 */
function normalizeName(name) {
  if (typeof name !== 'string') {
    name = String(name);
  }
  return name.toLowerCase();
}

/**
 * Normalizes value of a header.
 * @param {string} value
 * @returns {string} Normalized name
 */
function normalizeValue(value) {
  if (typeof value !== 'string') {
    value = String(value);
  }
  return value;
}

/**
 * A generator for list of headers from a string.
 *
 * ```javascript
 * for (let [name, value] of headersStringToList('a:b')) {
 *  ...
 * }
 * ```
 * @param {string} string Headers string to parse
 * @returns {Generator<string[]>}
 */
function* headersStringToList(string) {
  if (!string || string.trim() === '') {
    return [];
  }
  const headers = string.split(/\n(?=[^ \t]+)/gim);
  for (let i = 0, len = headers.length; i < len; i++) {
    const line = headers[i].trim();
    if (line === '') {
      continue;
    }
    const sepPosition = line.indexOf(':');
    if (sepPosition === -1) {
      yield [line, ''];
    } else {
      const name = line.substring(0, sepPosition);
      const value = line.substring(sepPosition + 1).trim();
      yield [name, value];
    }
  }
}

/**
 * The same interface as Web platform's Headers but without 
 * CORS restrictions.
 */
export class Headers {
  /**
   * @param {string | Record<string, string> | Headers=} headers The headers to parse.
   */
  constructor(headers) {
    /**
     * The keys are canonical keys and the values are the input values.
     * @type {Record<string, RawValue>}
     */
    this._map = {};
    if (!headers) {
      return;
    }
    if (headers instanceof Headers) {
      headers.forEach((value, name) => this.append(name, value));
    } else if (typeof headers === 'string') {
      const iterator = headersStringToList(headers);
      let result = iterator.next();
      while (!result.done) {
        this.append(result.value[0], result.value[1]);
        result = iterator.next();
      }
    } else if (headers) {
      Object.keys(headers).forEach((name) => this.append(name, headers[name]));
    }
  }

  /**
   * Adds value to existing header or creates new header
   * 
   * @param {string} name 
   * @param {string | string[] | undefined} value
   * @returns {void}
   */
  append(name, value) {
    if (Array.isArray(value)) {
      value.forEach(v => this.append(name, v));
      return;
    }
    const normalizedName = normalizeName(name);
    value = value ? normalizeValue(value) : '';
    let item = this._map[normalizedName];
    if (item) {
      const oldValue = item.value;
      item.value = oldValue ? `${oldValue},${value}` : value;
    } else {
      item = {
        name,
        value,
      };
    }
    this._map[normalizedName] = item;
  }

  /**
   * Removes a header from the list of headers.
   * @param {string} name The header name
   * @returns {void}
   */
  delete(name) {
    delete this._map[normalizeName(name)];
  }

  /**
   * Returns the current value of the header
   * @param {string} name Header name
   * @returns {string | undefined}
   */
  get(name) {
    name = normalizeName(name);
    return this.has(name) ? this._map[name].value : undefined;
  }

  /**
   * Checks if the header exists.
   * 
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    return Object.prototype.hasOwnProperty.call(this._map, normalizeName(name));
  }

  /**
   * Creates a new header. If the header exist it replaces the value.
   * 
   * @param {string} name
   * @param {string} value
   * @returns {void}
   */
  set(name, value) {
    const normalizedName = normalizeName(name);
    this._map[normalizedName] = {
      value: normalizeValue(value),
      name,
    };
  }

  /**
   * Iterates over each header.
   * 
   * @param {(value: string, name: string, headers: Headers) => void} callback
   * @param {unknown=} thisArg
   * @returns {void}
   */
  forEach(callback, thisArg) {
    const keys = Object.keys(this._map);
    keys.forEach((key) => {
      const item = this._map[key];
      callback.call(thisArg, item.value, item.name, this);
    });
  }

  /**
   * Calls a defined callback function on each element of the headers, and returns an array that contains the results.
   * 
   * @template U
   * @param {(name: string, value: string) => U} callbackfn A function that accepts up to two arguments. The map method calls the callbackfn function one time for each header.
   * @param {unknown=} thisArg An object to which the `this` keyword can refer in the callbackfn function. If thisArg is omitted, undefined is used as the this value.
   * @returns {U[]}
   */
  map(callbackfn, thisArg) {
    const keys = Object.keys(this._map);
    const results = /** @type U[] */ ([]);
    for (const name of keys) {
      const item = this._map[name];
      const cbReturn = callbackfn.call(thisArg, item.value, item.name);
      results.push(cbReturn);
    }
    return results;
  }

  /**
   * @returns {string} The headers HTTP string
   */
  toString() {
    const result = /** @type string[] */ ([]);
    const keys = Object.keys(this._map);
    for (const name of keys) {
      const item = this._map[name];
      let tmp = `${item.name}: `;
      if (item.value) {
        tmp += item.value;
      }
      result.push(tmp);
    }
    return result.join('\n');
  }

  /**
   * Iterates over keys.
   * 
   * @returns IterableIterator<string>
   */
  *keys() {
    const keys = Object.keys(this._map);
    for (const name of keys) {
      yield this._map[name].name;
    }
  }

  /**
   * Iterates over values.
   * 
   * @returns IterableIterator<string>
   */
  *values() {
    const keys = Object.keys(this._map);
    for (const name of keys) {
      yield this._map[name].value;
    }
  }

  /**
   * Iterates over headers.
   * 
   * @returns IterableIterator<string[]>
   */
  *entries() {
    const keys = Object.keys(this._map);
    for (const name of keys) {
      yield [this._map[name].name, this._map[name].value];
    }
  }

  /**
   * Iterates over headers.
   * 
   * @returns IterableIterator<string[]>
   */
  *[Symbol.iterator]() {
    const keys = Object.keys(this._map);
    for (const name of keys) {
      yield [this._map[name].name, this._map[name].value];
    }
  }
}
