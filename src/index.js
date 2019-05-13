// import {
//   proxyServer as ProxyServer,
//   isRootCAFileExists,
//   generateRootCA,
// } from 'dora-anyproxy';
import { ProxyServer } from 'anyproxy';
import path from 'path';
import getRule from './getRule';

module.exports = function(args) {
  const { port, mockConfig } = args;
  const rule = getRule({ cwd: path.resolve(process.cwd()), port, config: mockConfig });
  const proxyServer = new ProxyServer({
    type: 'http',
    port,
    hostname: 'localhost',
    rule,
  });
  proxyServer.on('ready', () => {
    console.log('ready', port);
  });
  proxyServer.on('error', e => {
    /* */
    console.error(e);
  });

  proxyServer.start();
};
