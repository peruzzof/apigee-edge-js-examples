#! /usr/local/bin/node
/*jslint node:true */
// exportApiPromises.js
// ------------------------------------------------------------------
// export one or more Apigee Edge proxy bundles
//
// Copyright 2017-2020 Google LLC.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// last saved: <2020-November-05 08:55:25>

const fs         = require('fs'),
      path       = require('path'),
      mkdirp     = require('mkdirp'),
      edgejs     = require('apigee-edge-js'),
      common     = edgejs.utility,
      apigeeEdge = edgejs.edge,
      sprintf    = require('sprintf-js').sprintf,
      Getopt     = require('node-getopt'),
      version    = '20201105-0836',
      defaults   = { destination : 'exported' },
      getopt     = new Getopt(common.commonOptions.concat([
        ['N' , 'name=ARG', 'name of existing API proxy or shared flow'],
        ['P' , 'pattern=ARG', 'regex pattern for name of existing API proxy or shared flow; this always exports the latest revision.'],
        ['D' , 'destination=ARG', 'directory for export. Default: exported'],
        ['t' , 'trial', 'trial only. Do not actually export'],
        ['S' , 'sharedflow', 'search and export sharedflows, not proxies. Default: export proxies.'],
        ['R' , 'revision=ARG', 'revision of the asset to export. Default: latest']
      ])).bindHelp();

let collection = 'proxies';
function exportOneRevision(org, name, revision) {
  let artifactType = (opt.options.sharedflow)?'sharedflow':'apiproxy';
  return new Promise( (resolve, reject) => {
    if (opt.options.trial) {
      common.logWrite('WOULD EXPORT %s HERE; %s, revision:%s',
                      artifactType, name, revision);
      return resolve(path.join(opt.options.destination,
                               sprintf("%s-%s-%s-TIMESTAMP.zip", artifactType, name, revision)));
    }
    return org[collection].export({name:name, revision:revision})
      .then(result => {
        let fullFilename = path.join(opt.options.destination, result.filename);
        fs.writeFileSync(fullFilename, result.buffer);
        return resolve(fullFilename);
      });
  });
}

function exportLatestRevision(org, name) {
  return org[collection].getRevisions({name:name})
    .then(revisions => exportOneRevision(org, name, revisions[revisions.length - 1]) );
}

function exportLatestRevisionOfMatch(org, pattern, cb) {
  let re1 = (pattern) ? new RegExp(pattern) : null;
  return org[collection].get({})
    .then( result => {
      const reducer = (p, artifactName) =>
        p.then( a =>
                exportLatestRevision(org, artifactName)
                .then( filename => [ ...a, {artifactName, filename} ] ));

      return result
        .filter( a => (re1)?a.match(re1):true)
        .reduce(reducer, Promise.resolve([]));
    });
}


// ========================================================

console.log(
  'Apigee Edge Proxy/Sharedflow Export tool, version: ' + version + '\n' +
    'Node.js ' + process.version + '\n');

process.on('unhandledRejection',
            r => console.log('\n*** unhandled promise rejection: ' + util.format(r)));

common.logWrite('start');

// process.argv array starts with 'node' and 'scriptname.js'
var opt = getopt.parse(process.argv.slice(2));

if ( opt.options.name && opt.options.pattern ) {
  console.log('You must specify only one of a name, or a pattern for the name, for the proxy or sharedflow to be exported');
  getopt.showHelp();
  process.exit(1);
}

if ( opt.options.revision && opt.options.pattern) {
  console.log('You may not specify a revision when specifying a pattern. Doesn\'t make sense.');
  getopt.showHelp();
  process.exit(1);
}

if ( ! opt.options.destination) {
  opt.options.destination = defaults.destination;
}

if ( ! opt.options.trial) {
  mkdirp.sync(opt.options.destination);
}

collection = (opt.options.sharedflow) ? 'sharedflows' : 'proxies';

common.verifyCommonRequiredParameters(opt.options, getopt);

apigeeEdge.connect(common.optToOptions(opt))
  .then(org => {
    common.logWrite('connected');

    if (opt.options.name && opt.options.revision) {
      common.logWrite('exporting');
      return exportOneRevision(org, opt.options.name, opt.options.revision);
    }

    if (opt.options.name) {
      return exportLatestRevision(org, opt.options.name);
    }

    // without pattern, this will export all latest revisions
    return exportLatestRevisionOfMatch(org, opt.options.pattern)
      .then(result => {
        common.logWrite('%s %d %s',
                        (opt.options.trial)?'would export':'exported',
                        result.length,
                        collection);
        return JSON.stringify(result, null, 2);
      });
  })
  .then(result => console.log('\n' + result + '\n'))
  .catch(e => common.logWrite(JSON.stringify(e, null, 2)));
