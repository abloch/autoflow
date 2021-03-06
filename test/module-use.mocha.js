/*global autoflow:true BaseTask:true */

if (typeof(chai) === 'undefined') {
  var chai = require('chai');
}

if (typeof(autoflow) === 'undefined') {
  var autoflow = require('../'); //require('autoflow');
}

if (typeof(BaseTask) === 'undefined') {
  var BaseTask = require('../lib/base-task.js');
}

(function () {
  'use strict';

  var t = chai.assert;

  /**
     Testing the general use of autoflow
  */

  suite('module-use');

  /**
     @example
     var autoflow = require('autoflow');
     autoflow.options.an_option = 'something';

     // define function
     var loadAndSave = autoflow('myName', 'one, two, cb -> err, result1, result2',
     foo, 'one, cb      -> err, cat',
     bar, 'two, cat, cb -> err, dog',
     baz, 'dog, cb      -> err, result1',
     bum, 'dog, cb      -> err, result2');

     // OR using AST

     var loadAndSave = autoflow();
     loadAndSave.setAndValidateAST({
     inParams: ['one', 'two'],
     tasks: { },
     outTask: { a: ['three'] }
     });

     //if you want to listen to task completion events
     loadAndSave.events.on('task.complete', function (taskObj) { });

     loadAndSave(1,2,cb); // execute like any other function
  */

  test('module exports an function object with properties', function (done) {
    t.isFunction(autoflow, 'is a core constructor and default dsl function');
    t.isObject(autoflow.options, 'has property for global autoflow options');
    t.isObject(autoflow.events, 'has global autoflow event manager');
    t.isFunction(autoflow.logEvents, 'has function to enable event logging');
    t.isFunction(autoflow.trackTasks, 'has function to enable task and flow tracking');
    t.isFunction(autoflow.resolvePromises, 'has fn to enable promise detection & resolution');
    done();
  });

  function foo() { }
  function bar() { }

  test('calling autoflow constructor function creates new function with ast', function (done) {
    var r = autoflow();
    t.isFunction(r, 'is a function ready to execute flow');
    t.isObject(r.ast, 'is object for inspecting AST');
    t.deepEqual(r.ast.inParams, [],              'ast.inParams should return empty array');
    t.deepEqual(r.ast.tasks, [],                 'ast.tasks() should return empty array');
    t.deepEqual(r.ast.outTask, { a: [], type: 'finalcb' });
    done();
  });

  test('setAndValidateAST sets the ast and validates returning errors', function (done) {
    var r = autoflow();
    var errors = r.setAndValidateAST({
      inParams: ['a', 'b'],
      tasks: [
        { f: foo, a: ['a'], out: ['c'] },
        { f: bar, a: ['b'], out: ['d'] }
      ],
      outTask: { a: ['c', 'd'] }
    });
    t.deepEqual(r.ast.inParams, ['a', 'b'],      'ast.inParams() should match array just set');
    t.deepEqual(r.ast.tasks, [
      { f: foo, a: ['a'], out: ['c'], type: 'cb', name: 'foo' },
      { f: bar, a: ['b'], out: ['d'], type: 'cb', name: 'bar' }
    ]);
    t.deepEqual(r.ast.outTask, { a: ['c', 'd'], type: 'finalcb' },      'should return obj just set');
    done();
  });

  test('use autoflow() default DSL from module', function (done) {
    function multiply(a, b, cb) { cb(null, a * b); }
    function add(a, b, cb) { cb(null, a + b); }
    var fn = autoflow('multiplyAdd', 'a, b, cb -> err, m, s',
                   multiply, 'a, b, cb -> err, m',
                   add, 'm, a, cb -> err, s'
                  );


    fn(2, 3, function (err, m, s) {
      t.deepEqual(err, null, 'should not be any error');
      t.equal(m, 6);
      t.equal(s, 8);
      done();
    });
  });

  test('use autoflow.selectFirst() default DSL with events', function (done) {
    function noSuccess(a, b, cb) {
      setTimeout(function () { cb(null); }, 100); // returns undefined result
    }
    function noSuccessNull(a, b, cb) { cb(null, null); } // returns null result
    function add(a, b, cb) { cb(null, a + b); }


    var fn = autoflow.selectFirst('mySelectFirst', 'a, b, cb -> err, c',
                               noSuccess, 'a, b, cb -> err, c',
                               noSuccessNull, 'a, b, cb -> err, c',
                               add, 'a, b, cb -> err, c',
                               noSuccess, 'a, b, cb -> err, c'
                              );

    var collector = autoflow.createEventCollector();
    collector.capture(fn, 'task.complete');

    fn(2, 3, function (err, c) {
      t.deepEqual(err, null, 'should not be any error');
      t.equal(c, 5);
      var events = collector.list();
      t.equal(events.length, 3, 'should have seen two task compl events');
      t.equal(events[0].task.name, 'noSuccess', 'name matches');
      t.equal(events[1].task.name, 'noSuccessNull', 'name matches');
      t.equal(events[2].task.name, 'add', 'name matches');
      t.deepEqual(events[2].task.results, [5], 'results match');
      done();
    });
  });

  test('reference local/global vars', function (done) {
    function foo(cb) {
      cb(null, 100);
    }

    var fn = autoflow('refGlobal', 'cb -> err, result',
      'console.log', '"using global/local ref to console" ->',
      foo, 'cb -> err, result', { after: 'console.log' }
    );

    fn(function (err, result) {
      if (err) return done(err);
      t.equal(result, 100);
      done();
    });
  });

}());




