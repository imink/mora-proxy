import { join } from 'path';
import { existsSync } from 'fs';
import getProxyConfigFn from './getProxyConfig';

export default function getRule(args) {
  const { cwd, port, config } = args;
  const configPath = join(cwd, config);
  // const userRuleFile = join(cwd, 'rule.js');
  // if (existsSync(userRuleFile)) {
  //   console.info('load rule from rule.js');
  //   return require(userRuleFile);
  // }

  const getProxyConfig = getProxyConfigFn(
    configPath || './proxy.config.js',
    args,
  );
  return require('./rule')({
    port,
    hostname: '127.0.0.1',
    getProxyConfig,
    cwd,
    log: console,
  });
}
