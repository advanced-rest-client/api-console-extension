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
const gulp = require('gulp');
const fs = require('fs');
const archiver = require('archiver');

// Bumps manifest version
function bumpVersion() {
  var file = 'manifest.json';
  var manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  var version = manifest.version;
  var parts = version.split('.');
  version = parts.map((no) => {
    no = Number(no);
    if (no !== no) {
      no = 0;
    }
    return no;
  });
  version[2]++;
  manifest.version = version.join('.');
  manifest = JSON.stringify(manifest, null, 2);
  fs.writeFileSync(file, manifest, 'utf8');
}

// Builds the extension.
gulp.task('default', function(done) {
  bumpVersion();

  const output = fs.createWriteStream(__dirname + '/extension.zip');
  const archive = archiver('zip', {
    zlib: {
      level: 9
    }
  });
  output.on('close', function() {
    console.log(archive.pointer() + ' total bytes');
    done();
  });

  archive.on('error', function(err) {
    throw err;
  });
  archive.pipe(output);
  archive.file('manifest.json');
  archive.directory('js/');
  archive.directory('assets/');

  archive.finalize();
});
