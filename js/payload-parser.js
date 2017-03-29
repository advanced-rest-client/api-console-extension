/**
 * @license
 * Copyright 2016 The Advanced REST client authors <arc@mulesoft.com>
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 * http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */
'use strict';

class PayloadParser {
  /**
   * Expecting the input string is a url encoded string.
   * @param {String} str A string to decode.
   * @return {Array<Object>} An array of objects with "name" and "value" keys.
   */
  static parseString(str) {
    var result = [];
    if (!str || typeof str !== 'string') {
      return result;
    }
    var list = Array.from(String(result).trim())
    var state = 0; // means searching for a key, 1 - value.
    var key = '';
    var value = '';
    var tempObj = {};
    while (true) {
      let ch = list.shift();
      if (ch === undefined) {
        if (tempObj.name) {
          tempObj.value = value;
          result.push(tempObj);
        }
        break;
      }
      if (state === 0) {
        if (ch === '=') {
          tempObj.name = key;
          key = '';
          state = 1;
        } else {
          key += ch;
        }
      } else {
        if (ch === '&') {
          tempObj.value = value;
          value = '';
          state = 0;
          result.push(tempObj);
          tempObj = {};
        } else {
          value += ch;
        }
      }
    }
    return result;
  }
}
