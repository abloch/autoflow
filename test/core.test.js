'use strict';

var test = require('tap').test;

var react = require('../react');
var EventCollector = require('../lib/event-collector');  // require('react/lib/event-collector'); // turn on tracking and get EventCollector

function multiply(x, y, cb) { cb(null, x * y); }
function add(x, y, cb) { cb(null, x + y); }
function badFunc(a, b, cb) { throw new Error('badFuncThrow'); }
function badF2(a, b, cb) { cb('my-error'); }
function fnRetsSum(a, b) { return a + b; }
var anonFn = function (a, b) { return a + b; };

test('set and validate AST', function (t) {
  var fn = react();
  var errors = fn.setAndValidateAST({
    name: 'myflow',
    inParams: ['a', 'b'],
    tasks: [
      { f: multiply, a: ['a', 'b'], out: ['c'] }
    ],
    outTask: { a: ['c'] },
    otherOpt: 'foo',
    otherOpt2: 'bar'
  });
  t.deepEqual(errors, [], 'should set and validate as true');
  t.deepEqual(fn.ast.inParams, ['a', 'b']);
  t.deepEqual(fn.ast.tasks, [
      { f: multiply, a: ['a', 'b'], out: ['c'], type: 'cb', name: 'multiply' }
    ]);
  t.deepEqual(fn.ast.outTask, { a: ['c'], type: 'finalcb' });
  t.equal(fn.ast.name, 'myflow', 'name should match if set');
  t.equal(fn.ast.otherOpt, 'foo', 'any additional options should pass through');
  t.end();
});

test('unnamed tasks will be assigned unique names', function (t) {
  var fn = react();
  var errors = fn.setAndValidateAST({
    inParams: ['a', 'b'],
    tasks: [
      { f: multiply, a: ['a', 'b'], out: ['c'] },
      { f: multiply, a: ['a', 'b'], out: ['d'], name: 'multiply' },
      { f: multiply, a: ['a', 'b'], out: ['e'], name: 'times' },
      { f: anonFn,   a: ['a', 'b'], out: ['g'], type: 'ret' },
      { f: multiply, a: ['a', 'b'], out: ['f'] }
    ],
    outTask: { a: ['c'] }
  });
  t.deepEqual(errors, [], 'should set and validate as true');
  t.equal(fn.ast.name.slice(0, 'flow_'.length), 'flow_', 'generated flow name should start with flow_');
  t.deepEqual(fn.ast.tasks, [
      { f: multiply, a: ['a', 'b'], out: ['c'], type: 'cb', name: 'multiply_0' },
      { f: multiply, a: ['a', 'b'], out: ['d'], name: 'multiply', type: 'cb' },
      { f: multiply, a: ['a', 'b'], out: ['e'], name: 'times', type: 'cb' },
      { f: anonFn,   a: ['a', 'b'], out: ['g'], type: 'ret', name: 'task_3' },    
      { f: multiply, a: ['a', 'b'], out: ['f'], type: 'cb', name: 'multiply_4' }
    ]);
  t.end();
});


test('execution with no errors should call callback with result', function (t) {
  var fn = react();
  var errors = fn.setAndValidateAST({
    inParams: ['a', 'b'],
    tasks: [
      { f: multiply, a: ['a', 'b'], out: ['c'] }
    ],
    outTask: { a: ['c'] }
  });
  t.deepEqual(errors, [], 'no validation errors');
  fn(2, 3, function (err, c) {
    t.equal(err, null);
    t.equal(c, 6);
    t.end();
  });
});

test('multi-step', function (t) {
  t.plan(4);
  var fn = react();
  var errors = fn.setAndValidateAST({
    inParams: ['a', 'b'],
    tasks: [    
      { f: multiply, a: ['a', 'b'], out: ['c'] },
      { f: add, a: ['c', 'b'], out: ['d'] }
    ],
    outTask: { a: ['c', 'd'] }
  });
  t.deepEqual(errors, [], 'no validation errors');

  fn(2, 3, function (err, c, d) {
    t.equal(err, null);
    t.equal(c, 6);
    t.equal(d, 9);
    t.end();
  });
});  

test('multi-step with after as nonarr fn', function (t) {
  t.plan(7);
  var fn = react();
  var errors = fn.setAndValidateAST({
    inParams: ['a', 'b'],
    tasks: [    
      { f: multiply, a: ['a', 'b'], out: ['c'], after: add },
      { f: add, a: ['a', 'b'], out: ['d'] }
    ],
    outTask: { a: ['c', 'd'] }
  });
  t.deepEqual(errors, [], 'no validation errors');

  var collector = new EventCollector();
  collector.capture(fn, 'task.complete');
  
  fn(2, 3, function (err, c, d) {
    t.equal(err, null);
    t.equal(c, 6);
    t.equal(d, 5);
    var events = collector.list();
    t.equal(events.length, 2, 'should have seen one task compl events');
    t.equal(events[0].task.name, 'add', 'name matches');
    t.equal(events[1].task.name, 'multiply', 'name matches');
    t.end();
  });
});  

test('mixed multi-step with after as nonarr fn w/events', function (t) {
  t.plan(19);
  var fn = react();
  var errors = fn.setAndValidateAST({
    inParams: ['a', 'b'],
    tasks: [    
      { f: multiply, a: ['a', 'b'], out: ['c'], after: fnRetsSum },
      { f: fnRetsSum, a: ['a', 'b'], out: ['d'], type: 'ret' }
    ],
    outTask: { a: ['c', 'd'] }
  });
  t.deepEqual(errors, [], 'no validation errors');

  var collector = new EventCollector();
  collector.capture(fn, 'task.complete');
  
  fn(2, 3, function (err, c, d) {
    t.equal(err, null);
    t.equal(c, 6);
    t.equal(d, 5);
    var events = collector.list();
    t.equal(events.length, 2, 'should have seen one task compl events');
    t.equal(events[0].task.name, 'fnRetsSum', 'name matches');
    t.ok(events[0].task.id, 'has unique id');
    t.ok(events[0].task.startTime, 'has startTime');
    t.ok(events[0].task.endTime, 'has endTime');
    t.ok(events[0].task.elapsedTime !== undefined, 'has elapsedTime');    
    t.ok(events[0].task.args, 'has args');
    t.ok(events[0].task.results, 'has results');
    t.equal(events[1].task.name, 'multiply', 'name matches');
    t.ok(events[1].task.id, 'has unique id');
    t.ok(events[1].task.startTime, 'has startTime');
    t.ok(events[1].task.endTime, 'has endTime');
    t.ok(events[1].task.elapsedTime !== undefined, 'has elapsedTime');    
    t.ok(events[1].task.args, 'has args');
    t.ok(events[1].task.results, 'has results');
    t.end();
  });
});  




test('sets obj values', function (t) {
  t.plan(5);
  var fn = react();
  var errors = fn.setAndValidateAST({
    inParams: ['a', 'b', 'c'],
    tasks: [    
      { f: multiply, a: ['a', 'b'], out: ['c.mult'] },
      { f: fnRetsSum, a: ['c.mult', 'b'], out: ['c.sum'], type: 'ret' }
    ],
    outTask: { a: ['c.mult', 'c.sum', 'c'] }
  });
  t.deepEqual(errors, [], 'no validation errors');

  fn(2, 3, { foo: 1 }, function (err, cmult, csum, c) {
    t.deepEqual(err, null, 'should be no err');
    t.equal(cmult, 6);
    t.equal(csum, 9);
    t.deepEqual(c, { foo: 1, mult: 6, sum: 9});
    t.end();
  });
});  

test('error when cant complete', function (t) {
  t.plan(2);
  var fn = react();
  var errors = fn.setAndValidateAST({
    inParams: ['a', 'b', 'c'],
    tasks: [    
      { f: multiply, a: ['a', 'b'], out: ['c.mult'] },
      { f: fnRetsSum, a: ['c.bad', 'b'], out: ['c.sum'], type: 'ret' },
      { f: add, a: ['c.sum', 'a'], out: ['d']}
    ],
    outTask: { a: ['c.mult', 'c.sum', 'd'] }
  });
  t.deepEqual(errors, [], 'no validation errors');

  fn(2, 3, { foo: 1 }, function (err, cmult, csum, d) {
    t.equal(err.message, 'no tasks running, flow will not complete, remaining tasks: fnRetsSum, add');
    t.end();
  });
});


test('objects', function (t) {
  function retObj(a, b, cb) { cb(null, { bar: a + b }); }
  function concat(a, b, cb) { cb(null, { result: a + b }); }
  t.plan(4);
  var fn = react();
  var errors = fn.setAndValidateAST({
    inParams: ['a', 'b'],
    tasks: [    
      { f: retObj, a: ['a.foo', 'b'], out: ['c'] },
      { f: concat, a: ['c.bar', 'b'], out: ['d'] }
    ],
    outTask: { a: ['c', 'd.result'] }
  });
  t.deepEqual(errors, [], 'no validation errors');

  fn({ foo: 'FOO' }, 'B', function (err, c, dresult) {
    t.equal(err, null);
    t.deepEqual(c, { bar: 'FOOB' });
    t.equal(dresult, 'FOOBB');
    t.end();
  });
});  

test('objects from container', function (t) {
  var C = {
    retObj: function retObj(a, b, cb) { cb(null, { bar: a + b }); },
    concat: function concat(a, b, cb) { cb(null, { result: a + b }); }
  };
  t.plan(4);
  var fn = react();
  var errors = fn.setAndValidateAST({
    inParams: ['a', 'b'],
    tasks: [    
      { f: C.retObj, a: ['a.foo', 'b'], out: ['c'] },
      { f: C.concat, a: ['c.bar', 'b'], out: ['d'] }
    ],
    outTask: { a: ['c', 'd.result'] }
  });
  t.deepEqual(errors, [], 'no validation errors');

  fn({ foo: 'FOO' }, 'B', function (err, c, dresult) {
    t.equal(err, null);
    t.deepEqual(c, { bar: 'FOOB' });
    t.equal(dresult, 'FOOBB');
    t.end();
  });
});  

test('objects from container input arg', function (t) {
  var CONT = {
    retObj: function retObj(a, b, cb) { cb(null, { bar: a + b }); },
    concat: function concat(a, b, cb) { cb(null, { result: a + b }); }
  };
  t.plan(4);
  var fn = react();
  var errors = fn.setAndValidateAST({
    inParams: ['a', 'b', 'CONT'],
    tasks: [    
      { f: 'CONT.retObj', a: ['a.foo', 'b'], out: ['c'] },
      { f: 'CONT.concat', a: ['c.bar', 'b'], out: ['d'] }
    ],
    outTask: { a: ['c', 'd.result'] }
  });
  t.deepEqual(errors, [], 'no validation errors');

  
  fn({ foo: 'FOO' }, 'B', CONT, function (err, c, dresult) {
    t.equal(err, null);
    t.deepEqual(c, { bar: 'FOOB' });
    t.equal(dresult, 'FOOBB');
    t.end();
  });
});  

test('use locals for functions', function (t) {
  var locals = {
    retObj: function retObj(a, b, cb) { cb(null, { bar: a + b }); },
    concat: function concat(a, b, cb) { cb(null, { result: a + b }); }
  };
  t.plan(4);
  var fn = react();
  var errors = fn.setAndValidateAST({
    inParams: ['a', 'b'],
    tasks: [    
      { f: 'retObj', a: ['a.foo', 'b'], out: ['c'] },
      { f: 'concat', a: ['c.bar', 'b'], out: ['d'] }
    ],
    outTask: { a: ['c', 'd.result'] },
    locals: locals
  });
  t.deepEqual(errors, [], 'no validation errors');

  fn({ foo: 'FOO' }, 'B', function (err, c, dresult) {
    t.equal(err, null);
    t.deepEqual(c, { bar: 'FOOB' });
    t.equal(dresult, 'FOOBB');
    t.end();
  });
});  

test('objects from locals', function (t) {
  var CONT = {
    retObj: function retObj(a, b, cb) { cb(null, { bar: a + b }); },
    concat: function concat(a, b, cb) { cb(null, { result: a + b }); }
  };
  t.plan(4);
  var fn = react();
  var errors = fn.setAndValidateAST({
    inParams: ['a', 'b'],
    tasks: [    
      { f: 'CONT.retObj', a: ['a.foo', 'b'], out: ['c'] },
      { f: 'CONT.concat', a: ['c.bar', 'b'], out: ['d'] }
    ],
    outTask: { a: ['c', 'd.result'] },
    locals: { CONT: CONT }
  });
  t.deepEqual(errors, [], 'no validation errors');

  
  fn({ foo: 'FOO' }, 'B', function (err, c, dresult) {
    t.equal(err, null);
    t.deepEqual(c, { bar: 'FOOB' });
    t.equal(dresult, 'FOOBB');
    t.end();
  });
});  
  
test('multi-step func throws, cb with error', function (t) {
  t.plan(2);
  var fn = react();
  var errors = fn.setAndValidateAST({
    inParams: ['a', 'b'],
    tasks: [    
      { f: multiply, a: ['a', 'b'], out: ['c'] },
      { f: badFunc, a: ['c', 'b'], out: ['d'] }
    ],
    outTask: { a: ['c', 'd'] }
  });
  t.deepEqual(errors, [], 'no validation errors');

  fn(2, 3, function (err, c, d) {
    t.equal(err.message, 'badFuncThrow');
    t.end();
  });
});  
  
test('multi-step func cb err, cb with error', function (t) {
  t.plan(2);
  var fn = react();
  var errors = fn.setAndValidateAST({
    inParams: ['a', 'b'],
    tasks: [    
      { f: multiply, a: ['a', 'b'], out: ['c'] },
      { f: badF2, a: ['c', 'b'], out: ['d'] },
      { f: add, a: ['d', 'b'], out: ['e'] }
    ],
    outTask: { a: ['c', 'e'] }
  });
  t.deepEqual(errors, [], 'no validation errors');

  fn(2, 3, function (err, c, d) {
    t.equal(err.message, 'my-error');
    t.end();
  });
});  

test('using "this" in a cb function', function (t) {
  t.plan(3);
  function getA(cb) {
    /*jshint validthis: true */
    cb(null, this.a);
  }
  
  var fn = react();
  var errors = fn.setAndValidateAST({
    inParams: [],
    tasks: [    
      { f: getA, a: [], out: ['a'] }
    ],
    outTask: { a: ['a'] }
  });
  t.deepEqual(errors, [], 'no validation errors');

  var obj = {
      a: 100
  };

  fn.apply(obj, [function (err, a) {
    t.equal(err, null);
    t.equal(a, 100);
    t.end();
  }]);
});

test('using "this" in a sync function', function (t) {
  t.plan(3);
  function getA(cb) {
    /*jshint validthis: true */
    return this.a;
  }
  
  var fn = react();
  var errors = fn.setAndValidateAST({
    inParams: [],
    tasks: [    
      { f: getA, a: [], out: ['a'], type: 'ret' }
    ],
    outTask: { a: ['a'] }
  });
  t.deepEqual(errors, [], 'no validation errors');

  var obj = {
      a: 100
  };

  fn.apply(obj, [function (err, a) {
    t.equal(err, null);
    t.equal(a, 100);
    t.end();
  }]);
});

test('undefined input arguments will be upgraded from undefined to null', function (t) {
  var fn = react();
  function concat(a, b) {
    return '' + a + b;    
  }
  var errors = fn.setAndValidateAST({
    inParams: ['a', 'b'],
    tasks: [
      { f: concat, a: ['a', 'b'], out: ['c'], type: 'ret' }
    ],
    outTask: { a: ['c'] }
  });
  t.deepEqual(errors, [], 'no validation errors');
  fn('first', undefined, function (err, c) {  // undefined second param, upgrade to null
    t.equal(err, null);
    t.equal(c, 'firstnull');
    t.end();
  });
});



// Select first tests


test('selectFirst with first succeeding', function (t) {
  t.plan(6);
  var fn = react();
  var errors = fn.setAndValidateAST({
    inParams: ['a', 'b'],
    tasks: [    
      { f: multiply, a: ['a', 'b'], out: ['c'] },
      { f: add, a: ['a', 'b'], out: ['c'], after: ['multiply'] }
    ],
    outTask: { type: 'finalcbFirst', a: ['c'] }
  });
  t.deepEqual(errors, [], 'no validation errors');

  var collector = new EventCollector();
  collector.capture(fn, 'task.complete');

  fn(2, 3, function (err, c) {
    t.equal(err, null);
    t.equal(c, 6);
    var events = collector.list();
    t.equal(events.length, 1, 'should have seen one task compl events');
    t.equal(events[0].task.name, 'multiply', 'name matches');
    t.deepEqual(events[0].task.results, [6], 'results match');
    t.end();
  });
});  

test('selectFirst with third succeeding', function (t) {
  function noSuccess(a, b, cb) { cb(null); } // returns undefined result
  function noSuccessNull(a, b, cb) { cb(null, null); } // returns null result
  
  t.plan(6);
  var fn = react();
  var errors = fn.setAndValidateAST({
    inParams: ['a', 'b'],
    tasks: [    
      { f: noSuccess, a: ['a', 'b'], out: ['c'] },
      { f: noSuccessNull, a: ['a', 'b'], out: ['c'], after: ['noSuccess'] },
      { f: add, a: ['a', 'b'], out: ['c'], after: ['noSuccessNull'] }
    ],
    outTask: { type: 'finalcbFirst', a: ['c'] }
  });
  t.deepEqual(errors, [], 'no validation errors');

  var collector = new EventCollector();
  collector.capture(fn, 'task.complete');

  fn(2, 3, function (err, c) {
    t.equal(err, null);
    t.equal(c, 5);
    var events = collector.list();
    t.equal(events.length, 3, 'should have seen three task compl events');
    t.equal(events[2].task.name, 'add', 'name matches');
    t.deepEqual(events[2].task.results, [5], 'results match');
    t.end();
  });
});  


test('selectFirst forces order with third succeeding', function (t) {
  function noSuccess(a, b, cb) {
    setTimeout(function () { cb(null); }, 100); // returns undefined result
  }
  function noSuccessNull(a, b, cb) { cb(null, null); } // returns null result
  
  t.plan(8);
  var fn = react();
  var errors = fn.setAndValidateAST({
    inParams: ['a', 'b'],
    tasks: [    
      { f: noSuccess, a: ['a', 'b'], out: ['c'] },
      { f: noSuccessNull, a: ['a', 'b'], out: ['c'], after: ['noSuccess']},
      { f: add, a: ['a', 'b'], out: ['c'], after: ['noSuccessNull'] },
      { f: noSuccess, a: ['a', 'b'], out: ['c'], after: ['add'] }
    ],
    outTask: { type: 'finalcbFirst', a: ['c'] }
  });
  t.deepEqual(errors, [], 'no validation errors');

  var collector = new EventCollector();
  collector.capture(fn, 'task.complete');

  fn(2, 3, function (err, c) {
    t.equal(err, null);
    t.equal(c, 5);
    var events = collector.list();
    t.equal(events.length, 3, 'should have seen three task compl events');
    t.equal(events[0].task.name, 'noSuccess', 'name matches');
    t.equal(events[1].task.name, 'noSuccessNull', 'name matches');
    t.equal(events[2].task.name, 'add', 'name matches');
    t.deepEqual(events[2].task.results, [5], 'results match');
    t.end();
  });
});  




test('selectFirst using direct returns', function (t) {
  function noSuccess(a, b) {  } // returns undefined result
  function noSuccessNull(a, b) { return null; } // returns null result
  function addRet(a, b) { return a + b; }
  
  t.plan(6);
  var fn = react();
  var errors = fn.setAndValidateAST({
    inParams: ['a', 'b'],
    tasks: [    
      { f: noSuccess, a: ['a', 'b'], out: ['c'], type: 'ret' },
      { f: noSuccessNull, a: ['a', 'b'], out: ['c'], type: 'ret', after: ['noSuccess'] },
      { f: addRet, a: ['a', 'b'], out: ['c'], type: 'ret', after: ['noSuccessNull'] }
    ],
    outTask: { type: 'finalcbFirst', a: ['c'] }
  });
  t.deepEqual(errors, [], 'no validation errors');

  var collector = new EventCollector();
  collector.capture(fn, 'task.complete');

  fn(2, 3, function (err, c) {
    t.equal(err, null);
    t.equal(c, 5);
    var events = collector.list();
    t.equal(events.length, 3, 'should have seen three task compl events');
    t.equal(events[2].task.name, 'addRet', 'name matches');
    t.deepEqual(events[2].task.results, [5], 'results match');
    t.end();
  });
});  


