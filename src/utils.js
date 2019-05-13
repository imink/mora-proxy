import { parse as parseUrl } from 'url';
import pathToRegexp from 'path-to-regexp';
import isPlainObject from 'is-plain-object';
import mime from 'mime-type/with-db';

function decodeParam(val) {
  if (typeof val !== 'string' || val.length === 0) {
    return val;
  }

  return decodeURIComponent(val);
}

export function isRemote(str) {
  return str.indexOf('http://') === 0 || str.indexOf('https://') === 0;
}

export function getExpects(pattern) {
  const expect = {};
  if (pattern.indexOf(' ') > -1) {
    [expect.expectMethod, expect.expectPattern] = pattern.split(/\s+/);
  } else {
    expect.expectPattern = pattern;
  }

  return expect;
}

export function isMatch(req, pattern) {
  const { requestOptions, url } = req;
  const { method } = requestOptions;
  const urlObj = parseUrl(url);
  const { expectMethod, expectPattern } = getExpects(pattern);
  // Match method first.
  if (expectMethod && expectMethod.toUpperCase() !== method.toUpperCase()) {
    return false;
  }

  if (isRemote(expectPattern)) {
    const { hostname, port, path } = parseUrl(expectPattern);
    return (
      hostname === urlObj.hostname &&
      (port || '80') === (urlObj.port || '80') &&
      !!urlObj.path.match(pathToRegexp(path))
    );
  }

  return !!urlObj.pathname.match(pathToRegexp(expectPattern));
}

export function getParams(url, pattern) {
  const keys = [];
  const path =
    pattern.trim().indexOf(' ') > -1 ? pattern.split(' ')[1] : pattern;
  if (path === '/') {
    return {};
  }

  const regexp = pathToRegexp(path, keys);
  const m = regexp.exec(url);
  if (!keys.length || !m) {
    return {};
  }

  return m.slice(1).reduce((prev, ms, index) => {
    const key = keys[index];
    const prop = key.name;
    const val = decodeParam(ms);
    if (
      val !== undefined ||
      !Object.prototype.hasOwnProperty.call(prev, prop)
    ) {
      return { ...prev, ...{ [prop]: val } };
    }
    return prev;
  }, {});
}

export function getRes(req, callback) {
  let status = 200;
  let headers = {
    'access-control-allow-origin': '*',
  };

  function normalizeData(data) {
    switch (typeof data) {
      case 'string':
        return data;
      case 'function':
        return data();
      default:
        return JSON.stringify(data);
    }
  }

  return {
    type(type) {
      return this.set('Content-Type', mime.lookup(type));
    },
    set(key, val) {
      if (isPlainObject(key)) {
        headers = { ...headers, ...key };
      } else {
        headers[key] = val;
      }
      return this;
    },
    status(statusCode) {
      status = statusCode;
      return this;
    },
    json(data) {
      return this.type('json').end(JSON.stringify(data));
    },
    jsonp(data, callbackName) {
      if (!req.query || req.query[callbackName || 'callback'] === undefined) {
        return this.type('json')
          .status(400)
          .end({
            errors: [
              {
                status: 400,
                detail: 'Should provide a callback for JSONP',
              },
            ],
          });
      }

      const fn = req.query[callbackName || 'callback'];
      return this.type('json').end(`${fn}(${JSON.stringify(data)})`);
    },
    end(data) {
      const res = {
        statusCode: status,
        header: headers,
        body: normalizeData(data),
      };
      callback(res);
      return this;
    },
  };
}
