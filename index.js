/*
 * Express - Resources (New)
 * Copyright(c) 2012 TJ Peden <tj.peden@tj-coding.com>
 * MIT Licensed
 * 
 * Credit to TJ Holowaychuk and Daniel Gasienica for
 * their work on express-resource.
 */


/**
 * Module dependencies.
 */
 
var express = require('express'),
    path = require('path'),
    lingo = require('lingo'),
    HTTPMethods = require('methods').concat('del')
    _ = require('lodash');

_.str = require('underscore.string');
/**
 * Pre-defined action ordering.
 * As in express-resource.
 */

var orderedActions = [
  'index',
  'new',
  'create',
  'show',
  'edit',
  'update',
  'destroy',
  'query',
  'describe'
];

var additionalWhereSupport = [
  'update',
  'destroy'
]

/**
 * Extend function.
 */

function $(destination) { // extend
  var args = [].slice.call(arguments, 1);
  
  args.forEach(function(source) {
    for(var property in source)
      if(source.hasOwnProperty(property))
        destination[property] = source[property];
  });
  
  return destination;
}

/**
 * Generates a method for a given http action.
 * 
 * @param {Resource} self
 * @param {String} method
 * @param {String} base (action)
 * @return {Function}
 */

function httpMethod(self, method, base) {
  return function(action, callback) {
    if(callback === undefined) {
      if(action in self.actions) {
        callback = self.actions[action];
      } else {
        throw new Error("Action " + action + " needs a callback!");
      }
    }
    
    var path = self.path(base), before;
    if(!/\/$/.test(path))
          path += '/';
    path += action + ".:format?";
      
    if(self.before && action in self.before) {
      before = self.before[action];
    }

    if (self.version)
        path = '/' + self.version + path;
    
    self._map(method, path, before, callback)
      ._record(action, method, path);
  };
}

/**
 * Initialize a new `Resource` with the
 * given `name` and `actions`.
 * 
 * @param {String} name
 * @param {Object} actions
 * @param {Server} app
 */

function Resource(app, name, options) {
  this.app = app;
  this.before = options.before;
  this.name = options.name || name;
  this.root = options.root || false;
  this.base = this._base();
  this.version = options.version;

  this.id = options.id || this._defaultId();
  
  var self = this, member = {}, collection = {};

  HTTPMethods.forEach(function(method) {
    member[method] = httpMethod(self, method, 'show');
    collection[method] = httpMethod(self, method, 'index');
  });
  
  this.member = member;
  this.collection = collection;

  this.routes = [];
};

$(Resource.prototype, {
  
  /**
   * Configure the default actions.
   * 
   * @param {Object} actions
   */
  
  _init: function(actions) {
    this.actions = actions;
    var self = this;
    
    orderedActions.forEach(function(action) {
      if(!(action in self.actions)) return;
      var path = self.path(action),
          callback = self.actions[action],
          method, before = [];
      
      switch(action) {
        case 'index':
        case 'show':
        case 'new':
        case 'edit':
          method = 'get';
          break;
        case 'create':
          method = 'post';
          break;
        case 'update':
          method = 'put';
          break;
        case 'destroy':
          method = 'delete';
          break;
        case 'query':
          method = 'post';
          break;
        case 'describe':
          method = 'head'
          break;
      }
      
      path += '.:format?';

      if (self.before && self.before['all']) {
        before.push(self.before['all']);
      }
      if (self.before && action in self.before) {
        before.push(self.before[action]);
      }
      
      before = _.flatten(before);

      if (self.version)
        path = '/' + self.version + path;


      // support for routes that don't require the :id url_param to identify the resource
      // ie) PUT /users { where : { name : 'steve' } } instead of PUT /users/:user_id
      if (_.contains(additionalWhereSupport, action)) {
        // /users/:id
        var wherePath = _.str.strLeftBack(path, '/');
        // /users
        wherePath += '.:format?'
        // /users.:format?
        self._map(method, wherePath, before, callback)
          ._record(action, method, wherePath);
      } 

      self._map(method, path, before, callback)
        ._record(action, method, path);
    });
  },
  
  /**
   * Return the resource's default id string.
   * 
   * @return {String}
   */
  
  _defaultId: function() {
    return this.root ?
      'id' : lingo.en.singularize(this.name);
  },
  
  /**
   *  Return the base path (takes into account nesting0.
   * 
   * @return {String}
   */
  
  _base: function() {
    var base;
    
    if('_base' in this.app && this.app._base && this.app._base.length > 0) {
      base = this.app._base + '/' + this.name;
    } else {
      base = '/' + (this.root ? '' : this.name);
    }
    
    return base;
  },
  
  /**
   * Record the `method` and `path` a given `action`
   * is mapped to. Also preserves order.
   */
  
  _record: function(action, method, path) {
    method = method.toUpperCase();

    this.routes.push({
      action: action,
      method: method,
      path: path
    });
  },
  
  /**
   * Sets all the appropriate variables for nesting
   * before calling the callback that creates the
   * nested resources.
   * 
   * @param {Function} callback
   */
  
  _nest: function(callback) {
    var prev = this.app._base;
    this.app._base = this.path('show');
    this.app._trail.push(this.name);
    
    callback.apply(this);
    
    this.app._base = prev || null;
    this.app._trail.pop();
  },
  
  /**
   * Map http `method` and `path` to `callback`.
   * 
   * @param {String} method
   * @param {String} path
   * @param {String|Array} middleware
   * @param {Function} callback
   * @return {Resource} for chaining
   */
  
  _map: function(method, path, middleware, callback) {
    if(Array.isArray(middleware)) {
      this.app[method].apply(this.app, [path].concat(middleware, callback));
    } else {
      this.app[method](path, callback);
    }
    return this;
  },
  
  /**
   * Return a generated path for the given action
   * 
   * @param {String} action
   * @return {String}
   */
  
  path: function(action) {

    var result = this.base;

    switch(action) {
      case 'show':
      case 'edit':
      case 'update':
      case 'destroy':
        if(!/\/$/.test(result))
          result += '/';
        result += ':' + this.id;
    }
    
    switch(action) {
      case 'new':
      case 'query':
      case 'edit':
        if(!/\/$/.test(result))
          result += '/';
        result += action;
    }

    return result;
  },
  
  /**
   * Alias for app.resource
   * 
   * @param {String} name
   * @param {Object} options
   * @param {Function} callback
   * @return {Resource}
   */
  
  resource: function(name, options, callback) {
    return this.app.resource(name, options, callback);
  },
  
  /**
   * Returns a rendering of all the routes mapped
   * for this resource.
   * 
   * @return {String}
   */
  
  toString: function() {
    return this.routes.map(function(obj) {
      return obj.action + "\t" + obj.method + "\t" + obj.path;
    }).join("\n");
  }
});

var methods = {
  
  /**
   * Requires modules from the `app.settings.controllers` path.
   * This method uses caching so that multiple calls for the
   * same controller don't require multiple calls to require.
   * 
   * @return {Object}
   */
  
  _load: function(name, version) {
    this._loaded = this._loaded || {};
    
    if(!(name in this._loaded)) {
      var appDir = this.settings.app_dir; // /app
      var versionDir = path.join(appDir, version); // /app/v1
      var controllers = path.join(versionDir, 'controllers'); // /app/v1/controllers
      this._loaded[name] = require(path.join(controllers, name));
    }
    
    return this._loaded[name];
  },
  
  /**
   * Saves all resources into a table. The name used
   * is generated from it's nesting path so that the
   * same controller can be used in different levels.
   * 
   * @param {Resource} resource
   */
  
  addResource: function(resource) {
    var name = this._trail.map(function(name) {
      return lingo.en.singularize(name);
    }).concat(resource.name).join('_');
    
    this.resources[name] = resource;
  },
  
  /**
   * Loads the controller, creates the resouce object
   * and handles nesting.
   * 
   * @param {String} name
   * @param {Object} options
   * @param {Function} callback
   * @return {Resource}
   */
  
  resource: function(name, options, callback) {
    if('function' == typeof options)
      callback = options, options = {};

    this._trail = this._trail || [];
    this.resources = this.resources || {};
    var controller = this._load(name, options.version);
    var resource = new Resource(this, name, $({}, controller.options, options));

    this.addResource(resource);
    
    resource._init(controller);
    if('function' == typeof callback) {
      resource._nest(callback);
    }
    return resource;
  }
};

module.exports = function (app) {
  $(app, methods);

  return Resource;
}