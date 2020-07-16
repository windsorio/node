"use strict";

const assert = require("assert");
const removeSlash = require("remove-trailing-slash");
const looselyValidate = require("@segment/loosely-validate-event");
const axios = require("axios");
const axiosRetry = require("axios-retry");
const ms = require("ms");
const uuid = require("uuid/v4");
const md5 = require("md5");
const version = require("./package.json").version;
const isString = require("lodash.isstring");

const setImmediate = global.setImmediate || process.nextTick.bind(process);
const noop = () => {};

class Tracker {
  /**
   * Initialize a new `Tracker` with your Windsor `token` and an
   * optional dictionary of `options`.
   *
   * @param {String} token
   * @param {Object} [options] (optional)
   *   @property {Number} flushAt (default: 20)
   *   @property {Number} flushInterval (default: 10000)
   *   @property {String} host (default: 'https://hook.windsor.io')
   *   @property {Boolean} enable (default: true)
   */

  constructor(token, options) {
    options = options || {};

    assert(token, "You must pass your Windsor token.");

    this.queue = [];
    this.token = token;
    this.host = removeSlash(options.host || "https://hook.windsor.io");
    this.timeout = options.timeout || false;
    this.flushAt = Math.max(options.flushAt, 1) || 20;
    this.flushInterval = options.flushInterval || 10000;
    this.flushed = false;
    Object.defineProperty(this, "enable", {
      configurable: false,
      writable: false,
      enumerable: true,
      value: typeof options.enable === "boolean" ? options.enable : true,
    });

    axiosRetry(axios, {
      retries: options.retryCount || 3,
      retryCondition: this._isErrorRetryable,
      retryDelay: axiosRetry.exponentialDelay,
    });
  }

  _validate(message, type) {
    try {
      looselyValidate(message, type);
    } catch (e) {
      if (e.message === "Your message must be < 32kb.") {
        console.log(
          "Your message must be < 32kb. This is currently surfaced as a warning to allow clients to update. Versions released after August 1, 2018 will throw an error instead. Please update your code before then.",
          message
        );
        return;
      }
      throw e;
    }
  }

  /**
   * Send a user `message`.
   *
   * @param {Object} message
   * @param {Function} [callback] (optional)
   * @return {Tracker}
   */

  user(message, callback) {
    this._validate(message, "identify");
    this.enqueue("user", message, callback);
    return this;
  }

  /**
   * Send an event `message`.
   *
   * @param {Object} message
   * @param {Function} [callback] (optional)
   * @return {Tracker}
   */

  event(message, callback) {
    this._validate(message, "track");
    this.enqueue("event", message, callback);
    return this;
  }

  /**
   * Add a `message` of type `type` to the queue and
   * check whether it should be flushed.
   *
   * @param {String} type
   * @param {Object} message
   * @param {Function} [callback] (optional)
   * @api private
   */

  enqueue(type, message, callback) {
    callback = callback || noop;

    if (!this.enable) {
      return setImmediate(callback);
    }

    message = Object.assign({}, message);
    message.type = type;
    message.context = Object.assign(
      {
        library: {
          name: "windsor-node",
          version,
        },
      },
      message.context
    );

    message._metadata = Object.assign(
      {
        nodeVersion: process.versions.node,
      },
      message._metadata
    );

    if (!message.timestamp) {
      message.timestamp = new Date();
    }

    if (!message.messageId) {
      // We md5 the message to add more randomness. This is primarily meant
      // for use in the browser where the uuid package falls back to Math.random()
      // which is not a great source of randomness.
      // Borrowed from analytics.js (https://github.com/segment-integrations/analytics.js-integration-segmentio/blob/a20d2a2d222aeb3ab2a8c7e72280f1df2618440e/lib/index.js#L255-L256).
      message.messageId = `node-${md5(JSON.stringify(message))}-${uuid()}`;
    }

    // Historically, the `analytics-node` library has accepted strings and numbers as IDs.
    // However, our spec only allows strings. To avoid breaking compatibility,
    // we'll coerce these to strings if they aren't already.
    if (message.anonymousId && !isString(message.anonymousId)) {
      message.anonymousId = JSON.stringify(message.anonymousId);
    }
    if (message.userId && !isString(message.userId)) {
      message.userId = JSON.stringify(message.userId);
    }

    this.queue.push({ message, callback });

    if (!this.flushed) {
      this.flushed = true;
      this.flush();
      return;
    }

    if (this.queue.length >= this.flushAt) {
      this.flush();
    }

    if (this.flushInterval && !this.timer) {
      this.timer = setTimeout(this.flush.bind(this), this.flushInterval);
    }
  }

  /**
   * Flush the current queue
   *
   * @param {Function} [callback] (optional)
   * @return {Tracker}
   */

  flush(callback) {
    callback = callback || noop;

    if (!this.enable) {
      return setImmediate(callback);
    }

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (!this.queue.length) {
      return setImmediate(callback);
    }

    const items = this.queue.splice(0, this.flushAt);
    const callbacks = items.map((item) => item.callback);
    const messages = items.map((item) => item.message);

    const data = {
      batch: messages,
      timestamp: new Date(),
      sentAt: new Date(),
    };

    const done = (err) => {
      callbacks.forEach((callback) => callback(err));
      callback(err, data);
    };

    // Don't set the user agent if we're not on a browser. The latest spec allows
    // the User-Agent header (see https://fetch.spec.whatwg.org/#terminology-headers
    // and https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/setRequestHeader),
    // but browsers such as Chrome and Safari have not caught up.
    const headers = {};
    if (typeof window === "undefined") {
      headers["user-agent"] = `windsor-node/${version}`;
    }

    const req = {
      method: "POST",
      url: `${this.host}/${this.token}`,
      data,
      headers,
    };

    if (this.timeout) {
      req.timeout =
        typeof this.timeout === "string" ? ms(this.timeout) : this.timeout;
    }

    axios(req)
      .then(() => done())
      .catch((err) => {
        if (err.response) {
          const error = new Error(err.response.statusText);
          return done(error);
        }

        done(err);
      });
  }

  _isErrorRetryable(error) {
    // Retry Network Errors.
    if (axiosRetry.isNetworkError(error)) {
      return true;
    }

    if (!error.response) {
      // Cannot determine if the request can be retried
      return false;
    }

    // Retry Server Errors (5xx).
    if (error.response.status >= 500 && error.response.status <= 599) {
      return true;
    }

    // Retry if rate limited.
    if (error.response.status === 429) {
      return true;
    }

    return false;
  }
}

module.exports = Tracker;
