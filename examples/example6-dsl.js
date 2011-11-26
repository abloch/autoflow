'use strict';

/**
   Example using functions with the simple DSL
 */

var reactMod = require(__dirname+'/../lib/react.js'); 
var react = reactMod.react;
var reactOptions = reactMod.reactOptions;
reactOptions.debugOutput = true;
reactOptions.stackTraceLimitMin = 20;

function loadUser(uid, cb){ setTimeout(cb, 100, null, "User"+uid); }
function loadFile(filename, cb){ setTimeout(cb, 100, null, 'Filedata'+filename); }
function markdown(filedata) { return 'html'+filedata; }
function prepareDirectory(outDirname, cb){ setTimeout(cb, 200, null, 'dircreated-'+outDirname); }
function writeOutput(html, user, cb){  setTimeout(cb, 300, null, html+'_bytesWritten'); }
function loadEmailTemplate(cb) { setTimeout(cb, 50, null, 'emailmd'); }
function customizeEmail(user, emailHtml, cb) { return 'cust-'+user+emailHtml; }
function deliverEmail(custEmailHtml, cb) { setTimeout(cb, 100, null, 'delivered-'+custEmailHtml); }

function useHtml(err, html, user, bytesWritten) {
  if(err) {
    console.log('***Error: %s', err);
    return;
  }
  console.log('final result: %s, user: %s, written: %s', html, user, bytesWritten);     
}

var r = react('filename, uid, outDirname, cb').define(
    loadUser,         'uid              -> err, user',
    loadFile,         'filename         -> err, filedata',
    markdown,         'filedata         -> returns html',
    prepareDirectory, 'outDirname       -> err, dircreated', 
    writeOutput,      'html, user       -> err, bytesWritten', { after:prepareDirectory },
    loadEmailTemplate,'                 -> err, emailmd',
    markdown,         'emailmd          -> returns emailHtml',
    customizeEmail,   'user, emailHtml  -> returns custEmailHtml',
    deliverEmail,     'custEmailHtml    -> err, deliveredEmail', { after: writeOutput }
).callbackDef('err, html, user, bytesWritten');


//console.log(r.ast);


r.exec("hello.txt", 100, 'outHello', useHtml);
r.exec("small.txt", 200, 'outSmall', useHtml);
r.exec("world.txt", 300, 'outWorld', useHtml);
