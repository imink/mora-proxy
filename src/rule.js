import urlLib from 'url';
import { isRemote, isMatch, getParams, getRes } from './utils';
import { join } from 'path';
import { readFileSync } from 'fs';
import { parse as parseUrl } from 'url';
import isPlainObject from 'is-plain-object';
import { parse as getQuery } from 'qs';
import '@babel/polyfill';

function getSubPath(req, pattern) {
  const url = req.method + ' ' + req.path;
  const match = url.match(pattern);
  return (match && match[1]) || '';
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

module.exports = function(args) {
  const { cwd, getProxyConfig, log } = args;

  return {
    // polyfill 统一对函数处理, 所以这里sumary不要写成函数形式
    summary: 'Anyproxy v4 rule:',
    // 发送请求前拦截处理
    *beforeSendRequest(req) {
      return new Promise((resolve, reject) => {
        const { requestOptions } = req;
        const { method, hostname, port, path } = requestOptions;
        let isModified = false;
        const newRequestOptions = requestOptions;
        // 批量匹配规则
        batchMatch(req, getProxyConfig(), (val, pattern) => {
          const callback = function(response) {
            req.response = response;
            resolve(req);
          };
          const payloadStr = req.requestData.toString();
          if (payloadStr) {
            req.body = payloadStr;
          }
          const urlObj = parseUrl(req.url);
          if (urlObj.query) {
            req.query = getQuery(urlObj.query);
          }
          req.params = getParams(urlObj.pathname, pattern);
          // 单独处理函数
          if (typeof val === 'function') {
            console.info(
              `${method} ${
                req.url
              } matches ${pattern}, respond with custom function`,
            );
            val(req, getRes(req, callback));
          }
          // 处理本地路径问题
          if (typeof val === 'string' && !isRemote(val)) {
            log.info(
              `${method} ${
                req.url
              } matches ${pattern}, respond with local file`,
            );
            getRes(req, callback).end(readFileSync(join(cwd, val), 'utf-8'));
          }
          // 处理obj或者array类型
          if (isPlainObject(val) || Array.isArray(val)) {
            console.info(
              `${method} ${
                req.url
              } matches ${pattern}, respond with object or array`,
            );
            getRes(req, callback).json(val);
          }
          // 处理服务器代理
          const reqObj = urlLib.parse(req.url);
          function replacePath(path) {
            let retPath = path;
            for (const pattern in getProxyConfig()) {
              if (getProxyConfig().hasOwnProperty(pattern)) {
                const subPath = getSubPath(requestOptions, pattern);
                if (subPath) {
                  const urlPattern = RegExp(
                    pattern.replace(/\s*(?:GET|POST)\s+/i, ''),
                  );
                  retPath = retPath.replace(urlPattern, `/${subPath}`);
                }
              }
            }
            return retPath;
          }
          function setOption(val) {
            const { hostname, port, path } = urlLib.parse(val);
            newRequestOptions.hostname = hostname;
            if (port) {
              newRequestOptions.port = port;
            }
            newRequestOptions.path = replacePath(
              winPath(join(path, reqObj.path)),
            );

            // Fix anyproxy
            delete newRequestOptions.headers.host;
          }
          if (typeof val === 'string' && isRemote(val)) {
            console.info(
              `${method} ${
                req.url
              } matches ${pattern}, forward to ${val}`,
            );
            isModified = true;
            setOption(val);
            req.requestOptions = newRequestOptions;
            resolve(req);
          }
        });
        // 处理未匹配规则
        if (!isModified) {
          if (args.hostname === '127.0.0.1') {
            // 未匹配且未定义本地接口, 直接忽略, 不转发
            const response = {
              statusCode: 200,
              header: { 'Content-Type': 'application/json' },
              body: '{"msg": "proxy.config.js 为定义该接口"}'
            }
            req.response = response
            resolve(req);
          } else {
            newRequestOptions.hostname = args.hostname;
            newRequestOptions.port = args.port;
            console.info(
              `${method} ${req.url} don't match any rule, forward to ${
                args.hostname
              }:${args.port}`,
            );
            req.requestOptions = newRequestOptions;
            resolve(req);
          }
        }
      });
    },
    // 发送响应前处理
    *beforeSendResponse(req, responseDetail) {
      /* ... */
    },
    // 是否处理https请求
    *beforeDealHttpsRequest(req) {
      /* ... */
    },
    // 请求出错的事件
    *onError(req, error) {
      /* ... */
    },
    // https连接服务器出错
    *onConnectError(req, error) {
      /* ... */
    },
  };
};
