const { spy, stub } = require("sinon");
const bodyParser = require("body-parser");
const express = require("express");
const delay = require("delay");
const test = require("ava");
const Tracker = require(".");
const { version } = require("./package");

const noop = () => {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const context = {
  library: {
    name: "windsor-node",
    version,
  },
};

const metadata = { nodeVersion: process.versions.node };
const port = 4063;

const createClient = (options) => {
  options = Object.assign(
    {
      host: `http://localhost:${port}`,
    },
    options
  );

  const client = new Tracker("token", options);

  return client;
};

test.before.cb((t) => {
  express()
    .use(bodyParser.json())
    .post("/:token", (req, res) => {
      const batch = req.body.batch;

      const token = req.params.token;
      if (!token) {
        return res.status(400).json({
          error: { message: "missing token" },
        });
      }

      const ua = req.headers["user-agent"];
      if (ua !== `windsor-node/${version}`) {
        return res.status(400).json({
          error: { message: "invalid user-agent" },
        });
      }

      if (batch[0].type === "error") {
        return res.status(400).json({
          error: { message: "error" },
        });
      }

      if (batch[0].type === "timeout") {
        return setTimeout(() => res.end(), batch[0].timeout || 5000);
      }

      res.json({});
    })
    .listen(port, t.end);
});

test("expose a constructor", (t) => {
  t.is(typeof Tracker, "function");
});

test("require a token", (t) => {
  t.throws(() => new Tracker(), {
    message: "You must pass your Windsor token.",
  });
});

test("create a queue", (t) => {
  const client = createClient();

  t.deepEqual(client.queue, []);
});

test("default options", (t) => {
  const client = new Tracker("token");

  t.is(client.token, "token");
  t.is(client.host, "https://hook.windsor.io");
  t.is(client.flushAt, 20);
  t.is(client.flushInterval, 10000);
});

test("remove trailing slashes from `host`", (t) => {
  const client = new Tracker("token", { host: "http://google.com///" });

  t.is(client.host, "http://google.com");
});

test("overwrite defaults with options", (t) => {
  const client = new Tracker("token", {
    host: "a",
    flushAt: 1,
    flushInterval: 2,
  });

  t.is(client.host, "a");
  t.is(client.flushAt, 1);
  t.is(client.flushInterval, 2);
});

test("keep the flushAt option above zero", (t) => {
  const client = createClient({ flushAt: 0 });

  t.is(client.flushAt, 1);
});

test("enqueue - add a message to the queue", (t) => {
  const client = createClient();
  client.flushed = true;

  const timestamp = new Date();
  client.enqueue("type", { timestamp }, noop);

  t.is(client.queue.length, 1);

  const item = client.queue.pop();

  t.is(typeof item.message.messageId, "string");
  t.regex(item.message.messageId, /node-[a-zA-Z0-9]{32}/);
  t.deepEqual(item, {
    message: {
      timestamp,
      type: "type",
      context,
      _metadata: metadata,
      messageId: item.message.messageId,
    },
    callback: noop,
  });
});

test("enqueue - stringify userId", (t) => {
  const client = createClient();
  client.flushed = true;

  client.event(
    {
      userId: 10,
      event: "event",
    },
    noop
  );

  t.is(client.queue.length, 1);

  const item = client.queue.pop();

  t.is(item.message.anonymousId, undefined);
  t.is(item.message.userId, "10");
});

test("enqueue - stringify anonymousId", (t) => {
  const client = createClient();
  client.flushed = true;

  client.event(
    {
      anonymousId: 157963456373623802,
      name: "screen name",
      event: "event name",
    },
    noop
  );

  t.is(client.queue.length, 1);

  const item = client.queue.pop();

  t.is(item.message.userId, undefined);
  // v8 will lose precision for big numbers.
  t.is(item.message.anonymousId, "157963456373623800");
});

test("enqueue - stringify ids handles strings", (t) => {
  const client = createClient();
  client.flushed = true;

  client.event(
    {
      anonymousId: "15796345",
      // We're explicitly testing the behaviour of the library if a customer
      // uses a String constructor.
      userId: new String("pranay"), // eslint-disable-line no-new-wrappers
      event: "event name",
    },
    noop
  );

  t.is(client.queue.length, 1);

  const item = client.queue.pop();

  t.is(item.message.anonymousId, "15796345");
  t.is(item.message.userId.toString(), "pranay");
});

test("enqueue - don't modify the original message", (t) => {
  const client = createClient();
  const message = { event: "test" };

  client.enqueue("type", message);

  t.deepEqual(message, { event: "test" });
});

test("enqueue - flush on first message", (t) => {
  const client = createClient({ flushAt: 2 });

  spy(client, "flush");

  client.enqueue("type", {});
  t.true(client.flush.calledOnce);

  client.enqueue("type", {});
  t.true(client.flush.calledOnce);

  client.enqueue("type", {});
  t.true(client.flush.calledTwice);
});

test("enqueue - flush the queue if it hits the max length", (t) => {
  const client = createClient({
    flushAt: 1,
    flushInterval: null,
  });

  stub(client, "flush");

  client.enqueue("type", {});

  t.true(client.flush.calledOnce);
});

test("enqueue - flush after a period of time", async (t) => {
  const client = createClient({ flushInterval: 10 });
  stub(client, "flush");

  client.flushed = true; // skip initial flush
  client.enqueue("type", {});

  t.false(client.flush.called);
  await sleep(20);

  t.true(client.flush.calledOnce);
});

test("enqueue - don't reset an existing timer", async (t) => {
  const client = createClient({ flushInterval: 10 });
  stub(client, "flush");

  client.enqueue("type", {});
  await delay(5);
  client.enqueue("type", {});
  await delay(5);

  t.true(client.flush.calledOnce);
});

test("enqueue - extend context", (t) => {
  const client = createClient();
  client.flushed = true;

  client.enqueue(
    "type",
    {
      event: "test",
      context: { name: "travis" },
    },
    noop
  );

  const actualContext = client.queue[0].message.context;
  const expectedContext = Object.assign({}, context, { name: "travis" });

  t.deepEqual(actualContext, expectedContext);
});

test("enqueue - skip when client is disabled", async (t) => {
  const client = createClient({ enable: false });
  stub(client, "flush");

  const callback = spy();
  client.enqueue("type", {}, callback);
  await delay(5);

  t.true(callback.calledOnce);
  t.false(client.flush.called);
});

test("flush - don't fail when queue is empty", async (t) => {
  const client = createClient();

  await t.notThrowsAsync(client.flush);
});

test("flush - send messages", async (t) => {
  const client = createClient({ flushAt: 2 });

  const callbackA = spy();
  const callbackB = spy();
  const callbackC = spy();

  client.queue = [
    {
      message: "a",
      callback: callbackA,
    },
    {
      message: "b",
      callback: callbackB,
    },
    {
      message: "c",
      callback: callbackC,
    },
  ];

  const data = await client.flush();
  t.deepEqual(Object.keys(data), ["batch", "timestamp", "sentAt"]);
  t.deepEqual(data.batch, ["a", "b"]);
  t.true(data.timestamp instanceof Date);
  t.true(data.sentAt instanceof Date);
  t.true(callbackA.calledOnce);
  t.true(callbackB.calledOnce);
  t.false(callbackC.called);
});

test("flush - respond with an error", async (t) => {
  const client = createClient();
  const callback = spy();

  client.queue = [
    {
      message: { type: "error" },
      callback,
    },
  ];

  await t.throwsAsync(client.flush, { message: "Bad Request" });
});

test("flush - time out if configured", async (t) => {
  const client = createClient({ timeout: 500 });
  const callback = spy();

  client.queue = [
    {
      message: { type: "timeout", timeout: 1000 },
      callback,
    },
  ];

  await t.throwsAsync(client.flush, { message: "timeout of 500ms exceeded" });
});

test("flush - skip when client is disabled", async (t) => {
  const client = createClient({ enable: false });
  const callback = spy();

  client.queue = [
    {
      message: "test",
      callback,
    },
  ];

  await client.flush();

  t.false(callback.called);
});

test("flush - race condition - https://github.com/segmentio/analytics-node/issues/219", async (t) => {
  const client = createClient({ flushAt: 1 });
  const callback = spy();

  client.enqueue("timeout", { timeout: 200, a: "b" }, callback);

  const { batch } = await client.flush();

  t.true(callback.calledOnce);
  t.truthy(batch[0]);
  t.is(batch[0].type, "timeout");
  t.is(batch[0].timeout, 200);
  t.is(batch[0].a, "b");
});

test("flush - race condition 2", async (t) => {
  const client = createClient();
  const callbackA = spy();
  const callbackB = spy();
  const callbackC = spy();

  let flushA, flushB, flushC;
  client.enqueue("timeout", { timeout: 200, a: "b" }, callbackA);
  flushA = client.flush();
  client.enqueue("timeout", { timeout: 200, c: "d" }, callbackB);
  flushB = client.flush();
  client.enqueue("timeout", { timeout: 200, e: "f" }, callbackC);
  flushC = client.flush();

  // wait for the promises
  await sleep(100);
  await flushC;

  t.true(callbackA.calledOnce);
  t.true(callbackB.calledOnce);
  t.true(callbackC.calledOnce);

  t.is((await flushA).batch.length, 1);
  t.is((await flushB).batch.length, 2);
  t.is((await flushC).batch.length, 3);

  // Previous batches should be clear. This one should only have 1 message
  const callbackD = spy();
  client.enqueue("timeout", { timeout: 200, g: "h" }, callbackD);
  const flushD = client.flush();
  const { batch } = await flushD;

  t.true(callbackD.calledOnce);
  t.is(batch.length, 1);
});

test("flush - race condition with errors", async (t) => {
  const client = createClient();
  const callbackA = spy();
  const callbackB = spy();

  let flushA, flushB;
  client.enqueue("error", { a: "b" }, callbackA);
  flushA = client.flush();
  client.enqueue("timeout", { timeout: 200, c: "d" }, callbackB);
  flushB = client.flush();

  // wait for the promises to fire
  await sleep(100);

  await t.throwsAsync(() => flushA);
  await t.throwsAsync(() => flushB);

  t.true(callbackA.calledOnce);
  t.true(callbackB.calledOnce);
});

test("user - enqueue a message", async (t) => {
  const client = createClient({ flushAt: 1 });
  client.enqueue = spy((_a, _b, cb) => cb());

  const message = { userId: "id" };
  await client.user(message);

  t.true(client.enqueue.calledOnce);

  const args = client.enqueue.firstCall.args;
  t.is(args[0], "user");
  t.is(args[1], message);
  t.truthy(typeof args[2] === "function");
});

test("user - require a userId or anonymousId", async (t) => {
  const client = createClient();
  client.enqueue = spy((_a, _b, cb) => cb());

  await t.throwsAsync(() => client.user(), {
    message: "You must pass a message object.",
  });
  await t.throwsAsync(() => client.user({}), {
    message: 'You must pass either an "anonymousId" or a "userId".',
  });
  await t.notThrowsAsync(() => client.user({ userId: "id" }));
  await t.notThrowsAsync(() => client.user({ anonymousId: "id" }));
});

test.skip("group - enqueue a message", (t) => {
  const client = createClient();
  client.enqueue = spy((_a, _b, cb) => cb());

  const message = {
    groupId: "id",
    userId: "id",
  };

  client.group(message, noop);

  t.true(client.enqueue.calledOnce);
  t.deepEqual(client.enqueue.firstCall.args, ["group", message, noop]);
});

test.skip("group - require a groupId and either userId or anonymousId", (t) => {
  const client = createClient();
  client.enqueue = spy((_a, _b, cb) => cb());

  t.throws(() => client.group(), {
    message: "You must pass a message object.",
  });
  t.throws(() => client.group({}), {
    message: 'You must pass either an "anonymousId" or a "userId".',
  });
  t.throws(() => client.group({ userId: "id" }), {
    message: 'You must pass a "groupId".',
  });
  t.throws(() => client.group({ anonymousId: "id" }), {
    message: 'You must pass a "groupId".',
  });
  t.notThrows(() => {
    client.group({
      groupId: "id",
      userId: "id",
    });
  });

  t.notThrows(() => {
    client.group({
      groupId: "id",
      anonymousId: "id",
    });
  });
});

test("event - enqueue a message", async (t) => {
  const client = createClient();
  client.enqueue = spy((_a, _b, cb) => cb());

  const message = {
    userId: 1,
    event: "event",
  };

  await client.event(message);

  t.true(client.enqueue.calledOnce);

  const args = client.enqueue.firstCall.args;
  t.is(args[0], "event");
  t.is(args[1], message);
  t.truthy(typeof args[2] === "function");
});

test("event - require event and either userId or anonymousId", async (t) => {
  const client = createClient();
  client.enqueue = spy((_a, _b, cb) => cb());

  await t.throwsAsync(() => client.event(), {
    message: "You must pass a message object.",
  });
  await t.throwsAsync(() => client.event({}), {
    message: 'You must pass either an "anonymousId" or a "userId".',
  });
  await t.throwsAsync(() => client.event({ userId: "id" }), {
    message: 'You must pass an "event".',
  });
  await t.throwsAsync(() => client.event({ anonymousId: "id" }), {
    message: 'You must pass an "event".',
  });
  await t.notThrowsAsync(() =>
    client.event({
      userId: "id",
      event: "event",
    })
  );

  await t.notThrowsAsync(() =>
    client.event({
      anonymousId: "id",
      event: "event",
    })
  );
});

test.skip("page - enqueue a message", (t) => {
  const client = createClient();
  client.enqueue = spy((_a, _b, cb) => cb());

  const message = { userId: "id" };
  client.page(message, noop);

  t.true(client.enqueue.calledOnce);
  t.deepEqual(client.enqueue.firstCall.args, ["page", message, noop]);
});

test.skip("page - require either userId or anonymousId", (t) => {
  const client = createClient();
  client.enqueue = spy((_a, _b, cb) => cb());

  t.throws(() => client.page(), { message: "You must pass a message object." });
  t.throws(() => client.page({}), {
    message: 'You must pass either an "anonymousId" or a "userId".',
  });
  t.notThrows(() => client.page({ userId: "id" }));
  t.notThrows(() => client.page({ anonymousId: "id" }));
});

test.skip("screen - enqueue a message", (t) => {
  const client = createClient();
  client.enqueue = spy((_a, _b, cb) => cb());

  const message = { userId: "id" };
  client.screen(message, noop);

  t.true(client.enqueue.calledOnce);
  t.deepEqual(client.enqueue.firstCall.args, ["screen", message, noop]);
});

test.skip("screen - require either userId or anonymousId", (t) => {
  const client = createClient();
  client.enqueue = spy((_a, _b, cb) => cb());

  t.throws(() => client.screen(), {
    message: "You must pass a message object.",
  });
  t.throws(() => client.screen({}), {
    message: 'You must pass either an "anonymousId" or a "userId".',
  });
  t.notThrows(() => client.screen({ userId: "id" }));
  t.notThrows(() => client.screen({ anonymousId: "id" }));
});

test.skip("alias - enqueue a message", (t) => {
  const client = createClient();
  client.enqueue = spy((_a, _b, cb) => cb());

  const message = {
    userId: "id",
    previousId: "id",
  };

  client.alias(message, noop);

  t.true(client.enqueue.calledOnce);
  t.deepEqual(client.enqueue.firstCall.args, ["alias", message, noop]);
});

test.skip("alias - require previousId and userId", (t) => {
  const client = createClient();
  client.enqueue = spy((_a, _b, cb) => cb());

  t.throws(() => client.alias(), {
    message: "You must pass a message object.",
  });
  t.throws(() => client.alias({}), { message: 'You must pass a "userId".' });
  t.throws(() => client.alias({ userId: "id" }), {
    message: 'You must pass a "previousId".',
  });
  t.notThrows(() => {
    client.alias({
      userId: "id",
      previousId: "id",
    });
  });
});

test("isErrorRetryable", (t) => {
  const client = createClient();

  t.false(client._isErrorRetryable({}));

  // ETIMEDOUT is retryable as per `is-retry-allowed` (used by axios-retry in `isNetworkError`).
  t.true(client._isErrorRetryable({ code: "ETIMEDOUT" }));

  // ECONNABORTED is not retryable as per `is-retry-allowed` (used by axios-retry in `isNetworkError`).
  t.false(client._isErrorRetryable({ code: "ECONNABORTED" }));

  t.true(client._isErrorRetryable({ response: { status: 500 } }));
  t.true(client._isErrorRetryable({ response: { status: 429 } }));

  t.false(client._isErrorRetryable({ response: { status: 200 } }));
});

test("disallows messages > 32kb", async (t) => {
  const client = createClient();

  const event = {
    userId: 1,
    event: "event",
    properties: {},
  };
  for (var i = 0; i < 10000; i++) {
    event.properties[i] = "a";
  }

  await t.throwsAsync(() => client.event(event));
});
