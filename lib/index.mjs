'use strict';

import _ from 'lodash'
import config from 'config'
import chalk from 'chalk'
import minimatch from 'minimatch'
import winston from 'winston'
import { SPLAT } from 'triple-beam'

// colorize the ns attribute if used
winston.format.colorizeNs = winston.format(info => {
  if (info.ns)
    info.ns = chalk.magenta(info.ns);
  return info;
});

class NsFormat {
  constructor(opts) {
    this.opts = _.isObject(opts) ? opts : {ns: opts};
    if (!this.opts.ns)
      throw new Error('No namespace provided');
    if (_.isUndefined(this.opts.json))
      this.opts.json = true;
  }

  transform(info) {
    if (this.opts.message)
      info.message = `[${this.opts.ns}] ${info.message}`;
    info.ns = this.opts.ns;
    return info;
  }
}

// filter the message using its namespace
const filterNs = winston.format.filterNs = winston.format((info, opts = {}) => {
  const ns = info.ns || 'default';

  // If the ns does not match any in the current filter list, do nothing
  return _.some(opts.ns, nsPattern => minimatch(ns, nsPattern)) && info;
});

const nsFormat = opts => new NsFormat(opts);

// print the message with namespace on cli
winston.format.cliNs = winston.format.printf.bind(null, (info, opts = {}) => {
  let message = `${info.level} | ${info.ns} | ${info.message}`;
  if ((_.isUndefined(opts.json) || opts.json) && info[SPLAT] && !_.isEmpty(info[SPLAT][0]))
    message += ' | ' + JSON.stringify(info[SPLAT][0]);
  return message;
});

function getFormatters(formats) {
  return _.map(_.toArray(formats || []), format => {
    if (!_.isObject(format))
      format = {name: format};

    if (!(format.name in winston.format))
      throw new Error('Impossible to find format ' + format.name + ' for winston transport!');

    return winston.format[format.name](format.options || {});
  });
}

// For each transports in the logger configuration
const transports = _.map(config.logger.transports, function(logger) {
  // require the module if needed
  if (logger.require)
    require(logger.require);

  logger.options = logger.options || {};

  const formatters = getFormatters(logger.options.format);
  const ns = logger.ns || ['*'];

  formatters.unshift(filterNs({ns}));

  const options = _.extend({}, logger.options, {format: winston.format.combine(...formatters)});

  // create a new instance of the correct transport
  const Transport = winston.transports[logger.transport];
  return (new Transport(options)).setMaxListeners(Infinity);
});

// Configure the global winston instance
_.each(transports, transport => winston.add(transport));

// Expose a method allowing to create NsLoggers in exchange of a ns name
export default function createNsLogger(ns) {
  const logger = winston.createLogger({
    transports,
    format: nsFormat(ns),
  });
  return logger;
};
