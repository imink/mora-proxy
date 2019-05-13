import urlLib from 'url';
import { isRemote, isMatch, getParams, getRes } from './utils';
import { join } from 'path';
import { readFileSync } from 'fs';
import { parse as parseUrl } from 'url';
import isPlainObject from 'is-plain-object';
import { parse as getQuery } from 'qs';

function getSubPath(req, pattern) {
  const url = req.method + ' ' + req.path;
  const match = url.match(pattern);
  return match && match[1] || '';
}

function batchMatch(req, proxyConfig, fn) {
  for (const pattern in proxyConfig) {
    if (proxyConfig.hasOwnProperty(pattern)) {
      const val = proxyConfig[pattern];
      if (isMatch(req, pattern)) {
        const result = fn(val, pattern);
        if (result) {
          return result;
        }
      }
    }
  }
}

function winPath(path) {
  return path.replace(/\\/g, '/');
}

export default function(args) {
  const { cwd, getProxyConfig, log } = args;

  return {
    summary() {
      return 'Anyproxy v4 rule:';
    },

    shouldInterceptHttpsReq() {
      return true;
    },

    shouldUseLocalResponse(req) {
      return batchMatch(req, getProxyConfig(), (val) => {
        if (typeof val === 'function') {
          return true;
        }
        if (typeof val === 'string' && !isRemote(val)) {
          return true;
        }
        if (isPlainObject(val) || Array.isArray(val)) {
          return true;
        }
      }) || false;
    },

    dealLocalResponse(_req, reqBody, callback) {
      const req = _req;
      return batchMatch(req, getProxyConfig(), (val, pattern) => {
        // Add body, query, params to req Object
        if (reqBody) {
          // TODO: support FormData
          req.body = reqBody.toString();
        }
        const urlObj = parseUrl(req.url);
        if (urlObj.query) {
          req.query = getQuery(urlObj.query);
        }
        req.params = getParams(urlObj.pathname, pattern);

        // Handle with custom function
        if (typeof val === 'function') {
          log.info(`${req.method} ${req.url} matches ${pattern}, respond with custom function`);
          val(req, getRes(req, callback));
          return true;
        }

        // Handle with local file
        if (typeof val === 'string' && !isRemote(val)) {
          log.info(`${req.method} ${req.url} matches ${pattern}, respond with local file`);
          getRes(req, callback).end(readFileSync(join(cwd, val), 'utf-8'));
          return true;
        }

        // Handle with object or array
        if (isPlainObject(val) || Array.isArray(val)) {
          log.info(`${req.method} ${req.url} matches ${pattern}, respond with object or array`);
          getRes(req, callback).json(val);
          return true;
        }
      });
    },
    /**
    //=======================
    //when ready to send a request to server
    //向服务端发出请求之前
    //=======================
    */
    replaceRequestProtocol(req) {
      return batchMatch(req, getProxyConfig(), (val) => {
        if (val.indexOf('https://') === 0) {
          return 'https';
        }
      }) || 'http';
    },

    replaceRequestOption(req, option) {
      const proxyConfig = getProxyConfig();
      const newOption = option;
      const reqObj = urlLib.parse(req.url);
      let isModified = false;

      function replacePath(path) {
        let retPath = path;
        for (const pattern in proxyConfig) {
          if (proxyConfig.hasOwnProperty(pattern)) {
            const subPath = getSubPath(option, pattern);
            if (subPath) {
              const urlPattern = RegExp(pattern.replace(/\s*(?:GET|POST)\s+/i, ''));
              retPath = retPath.replace(urlPattern, `/${subPath}`);
            }
          }
        }
        return retPath;
      }

      function setOption(val) {
        const { hostname, port, path } = urlLib.parse(val);
        newOption.hostname = hostname;
        if (port) {
          newOption.port = port;
        }
        newOption.path = replacePath(winPath(join(path, reqObj.path)));

        // Fix anyproxy
        delete newOption.headers.host;
      }

      batchMatch(req, proxyConfig, (val, pattern) => {
        if (isRemote(val)) {
          log.info(`${req.method} ${req.url} matches ${pattern}, forward to ${val}`);
          isModified = true;
          setOption(val);
          return true;
        }
      });

      if (!isModified) {
        newOption.hostname = args.hostname;
        newOption.port = args.port;
        log.debug(
          `${req.method} ${req.url} don't match any rule, forward to ${args.hostname}:${args.port}`
        );
      }

      return newOption;
    },

    replaceRequestData(req, data) {
      return data;
    },

    /**
    //=======================
    //when ready to send the response to user after receiving response from server
    //向用户返回服务端的响应之前
    //=======================
    */
    replaceResponseStatusCode(req, res, statusCode) {
      return statusCode;
    },

    replaceResponseHeader(req, res, header) {
      return {
        ...header,
        'access-control-allow-origin': '*',
        'access-control-allow-headers':'Origin, X-Requested-With, Content-Type, Accept,Content-Range, Content-Disposition, Content-Description,Set-Cookie,, Access-Control-Request-Method, Access-Control-Request-Headers,Authorization,Authentication',
		    'access-control-allow-methods':'GET,POST,PUT,DELETE,PATCH,HEAD,OPTIONS',
		    'access-control-expose-headers':'Set-Cookie,Authorization,Authentication' 
      };
    },

    replaceServerResDataAsync(req, res, serverResData, callback) {
      callback(serverResData);
    },

    pauseBeforeSendingResponse() {
      return 1;
    },
  };
}
