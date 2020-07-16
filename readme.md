# windsor-node

Send data for [Windsor.io](https://windsor.io) from Node

<div align="center">
  <img src="https://cdn.windsor.io/github/windsor-node/windsor.png"/>
</div>

## Get started

1. **Create a [Windsor](https://windsor.io) Account**
2. [**Setup the Node source**](https://app.windsor.io/sources)
2. **Create Users** on Windsor
   - With `windsor-node`, call `windsor.user(...)` everytime a new user signs up or data about a user changes to keep things updated
3. **Track Events**
   - You'll want to see every important event or issue your user runs into. Call `windsor.event(...)` for every event you want to know a user has taken. You can setup alerts and more from [Windsor](https://windsor.io)

Read the docs [here](https://docs.windsor.io/docs/analytics).

### Why?

You care about your users. You probably already have a slack channel filling up with important events, or you search through logs to see what your users are upto. Windsor is a better way. Track the users and events you care about to Windsor so your company can more easily manage and understand your user behavior.

For example, you can create a new Windsor user from any Node app:

```js
windsor.user({
  userId: "01nc83ns",
  traits: {
    name: "Pranay Prakash",
    email: "hey@windsor.io",
    company: "windsor",
    posts: 42
  }
});
```

And track events you'd like to know your users took

```js
windsor.event({
  userId: "01nc83ns",
  event: "Post Created",
  properties: {
    title: "Getting Started",
    private: false
  }
});
```

Then follow the user on [Windsor](https://windsor.io)

<div align="center">
  <img src="https://cdn.windsor.io/github/windsor-node/follow.png"/>
</div>

## Installation

```bash
$ yarn add windsor-node --save
```

## Usage

```js
const Windsor = require("windsor-node");

const windsor = new Windsor("token");

windsor.user({
  userId: "user id",
  traits: {
    name: "user name",
    email: "user email"
  }
});

windsor.event({
  event: "event name",
  userId: "user id"
});
```

## Documentation

Documentation is available at [https://docs.windsor.io/docs/analytics](https://docs.windsor.io/docs/analytics)

## License

Copyright &copy; 2019 Windsor Software Inc. \<team@windsor.io\>

See the LICENSE file for details and see the SEGMENT_LICENSE file attribution to the [Segment Library](https://github.com/segmentio/analytics-node) this was based off.
