#!/usr/bin/env node
"use strict";

const program = require("commander");
const Tracker = require(".");
const pkg = require("./package");

const toObject = (str) => JSON.parse(str);

program
  .version(pkg.version)
  .option("-t, --token <token>", "the Windsor token to use")
  .option("-h, --host <host>", "the Windsor API hostname to use")
  .option("-t, --type <type>", "the Windsor message type")

  .option("-u, --userId <id>", "the user id to send the event as")
  .option(
    "-a, --anonymousId <id>",
    "the anonymous user id to send the event as"
  )
  .option(
    "-c, --context <context>",
    "additional context for the event (JSON-encoded)",
    toObject
  )

  .option("-e, --event <event>", "the event name to send with the event")
  .option(
    "-p, --properties <properties>",
    "the event properties to send (JSON-encoded)",
    toObject
  )

  .option(
    "-t, --traits <traits>",
    "the identify/group traits to send (JSON-encoded)",
    toObject
  )

  .parse(process.argv);

if (program.args.length !== 0) {
  program.help();
}

const token = program.token;
const host = program.host;
const type = program.type;

const userId = program.userId;
const anonymousId = program.anonymousId;
const context = program.context;

const event = program.event;
const properties = program.properties;
const traits = program.traits;

const run = (method, args) => {
  const windsor = new Tracker(token, { host, flushAt: 1 });
  windsor[method](args, (err) => {
    if (err) {
      console.error(err.stack);
      process.exit(1);
    }
  });
};

switch (type) {
  case "event":
    run("event", {
      event,
      properties,
      userId,
      anonymousId,
      context,
    });
    break;
  case "user":
    run("user", {
      traits,
      userId,
      anonymousId,
      context,
    });
    break;
  default:
    console.error("invalid type:", type);
    process.exit(1);
}
