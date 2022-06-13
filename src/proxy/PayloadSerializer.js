/** @typedef {import('../types').DeserializedPayload} DeserializedPayload */
/** @typedef {import('../types').ISafePayload} ISafePayload */
/** @typedef {import('../types').IFileMeta} IFileMeta */
/** @typedef {import('../types').IBlobMeta} IBlobMeta */
/** @typedef {import('../types').IMultipartBody} IMultipartBody */

export class PayloadSerializer {
  /**
   * 
   * @param {DeserializedPayload | null} payload 
   * @returns {Promise<ISafePayload | string | undefined>}
   */
  static async serialize(payload) {
    if (payload === undefined || payload === null) {
      return undefined;
    }
    if (typeof payload === 'string') {
      return payload;
    }
    if (payload instanceof File) {
      return PayloadSerializer.stringifyFile(payload);
    }
    if (payload instanceof Blob) {
      return PayloadSerializer.stringifyBlob(payload);
    }
    if (payload instanceof FormData) {
      try {
        const result = await PayloadSerializer.stringifyFormData(payload);
        return result;
      } catch (e) {
        console.warn(`Unable to transform FormData: ${e.message}`);
      }
    }
    return '';
  }

  /**
   * Stringifies a file object.
   * @param {File} file
   * @returns {Promise<ISafePayload>}
   */
  static async stringifyFile(file) {
    const buffer = await file.arrayBuffer();
    const view = new Uint8Array(buffer);
    const meta = /** @type IFileMeta */ ({
      mime: file.type,
      name: file.name,
    });
    const result = /** @type ISafePayload */ ({
      type: 'file',
      data: [...view],
      meta,
    });
    return result;
  }

  /**
   * Stringifies a blob object.
   *
   * @param {Blob} blob Blob object to be translated to string
   * @returns {Promise<ISafePayload>}
   */
  static async stringifyBlob(blob) {
    const buffer = await blob.arrayBuffer();
    const view = new Uint8Array(buffer);
    const meta = /** @type IBlobMeta */ ({
      mime: blob.type,
    });
    const result = /** @type ISafePayload */ ({
      type: 'blob',
      data: [...view],
      meta,
    });
    return result;
  }

  /**
   * Transforms the FormData object to a serialized object describing the data.
   *
   * @param {FormData} payload A `FormData` object
   * @returns {Promise<ISafePayload>} A promise resolved to a datastore safe entries.
   */
  static async stringifyFormData(payload) {
    // TS apparently doesn't know that FormData is iterable.
    const iterable = /** @type {Iterable<(string | File)[]>} */ (/** @type unknown */ (payload));
    const promises = /** @type Promise<IMultipartBody>[] */ ([]);
    for (const part of iterable) {
      const name = /** @type string */ (part[0]);
      promises.push(PayloadSerializer.serializeFormDataEntry(name, part[1]));
    }
    const items = await Promise.all(promises);
    return {
      type: 'formdata',
      data: items,
    }
  }

  /**
   * Transforms a FormData entry into a safe-to-store text entry
   *
   * @param {string} name The part name
   * @param {string | File | Blob} file The part value
   * @returns {Promise<IMultipartBody>} Transformed FormData part to a datastore safe entry.
   */
  static async serializeFormDataEntry(name, file) {
    if (typeof file === 'string') {
      return {
        name,
        value: { type: 'string', data: file },
      };
    }
    /** @type ISafePayload */
    let value;
    // API Client adds the "blob" when adding a text value with a mime type.
    // This is recognized by the UI to restore the entry as the text and not a file.
    if (file instanceof File && file.name !== 'blob') {
      value = await PayloadSerializer.stringifyFile(file);
    } else {
      value = await PayloadSerializer.stringifyBlob(file);
    }
    const part = /** @type IMultipartBody */ ({
      name,
      value,
    });
    return part;
  }

  /**
   * Restores the payload into its original format.
   * 
   * @param {ISafePayload | string | undefined | null} payload
   * @returns {Promise<DeserializedPayload>}
   */
  static async deserialize(payload) {
    if (payload === undefined || payload === null) {
      return undefined;
    }
    if (typeof payload === 'string') {
      return payload;
    }
    switch (payload.type) {
      case 'string': return /** @type string */ (payload.data);
      case 'file': return PayloadSerializer.deserializeFile(payload);
      case 'blob': return PayloadSerializer.deserializeBlob(payload);
      case 'formdata': return PayloadSerializer.deserializeFormData(/** @type IMultipartBody[] */ (payload.data));
      default: return undefined;
    }
  }

  /**
   * Deserializes previously serialized file object.
   * 
   * @param {ISafePayload} payload The serialized payload with a file.
   * @returns {File}
   */
  static deserializeFile(payload) {
    const data = /** @type number[] */ (payload.data);
    const meta = /** @type IFileMeta */ (payload.meta);
    const { mime, name } = meta;
    const { buffer } = new Uint8Array(data);
    return new File([buffer], name, {
      type: mime,
    });
  }

  /**
   * Deserializes previously serialized blob object.
   * 
   * In previous versions of ARC the data was a string as data URL. In API client this is a buffer.
   *
   * @param {ISafePayload} payload The serialized payload.
   * @returns {Blob} Restored blob value
   */
  static deserializeBlob(payload) {
    const data = /** @type number[] */ (payload.data);
    const meta = /** @type IBlobMeta */ (payload.meta);
    const { mime } = meta;
    const { buffer } = new Uint8Array(data);
    return new Blob([buffer], { type: mime });
  }

  /**
   * Deserializes FormData from API Client data model.
   *
   * @param {IMultipartBody[]} parts API Client model for multipart.
   * @returns {FormData} Restored form data
   */
  static deserializeFormData(parts) {
    const fd = new FormData();
    if (!Array.isArray(parts) || !parts.length) {
      return fd;
    }
    parts.forEach(part => this._deserializeFormDataPart(fd, part));
    return fd;
  }

  /**
   * @param {FormData} form 
   * @param {IMultipartBody} part
   * @returns {void}
   */
  static _deserializeFormDataPart(form, part) {
    const { name, value } = part;
    if (typeof value === 'string') {
      form.append(name, value);
      return;
    }
    if (value.type === 'string') {
      form.append(name, /** @type string */ (value.data));
      return;
    }
    if (value.type === 'file') {
      const file = this.deserializeFile(value);
      form.append(name, file);
      return;
    }
    const blob = this.deserializeBlob(value);
    form.append(name, blob);
  }
}
