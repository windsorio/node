# windsor-node

Send data for [Windsor.io](https://windsor.io) from Node

<div align="center">
  <img src="https://cdn.windsor.io/github/windsor-node/windsor.png"/>
</div>

## Get started

1. **Create a [Windsor](https://windsor.io) Account**
2. [**Setup the Node source**](https://app.windsor.io/sources)
3. **Create Users** on Windsor
   - With `windsor-node`, call `windsor.user(...)` everytime a new user signs up or data about a user changes to keep things updated
4. **Track Events**
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
    posts: 42,
  },
});
```

And track events you'd like to know your users took

```js
windsor.event({
  userId: "01nc83ns",
  event: "Post Created",
  properties: {
    title: "Getting Started",
    private: false,
  },
});
```

Then follow the user on [Windsor](https://windsor.io)

<div align="center">
  <img src="https://cdn.windsor.io/github/windsor-node/follow.png"/>
</div>

## Installation

```bash
$ yarn add windsor-node
```

## Usage

```js
const Windsor = require("windsor-node");

const windsor = new Windsor("token");

windsor.user({
  userId: "user id",
  traits: {
    name: "user name",
    email: "user email",
  },
});

windsor.event({
  event: "event name",
  userId: "user id",
});
```

### Advanced Usage

`windsor-node` batches and sends multiple events together to improve performance on production systems. When using `windsor-node` on a serverless/lambda environment like AWS Lambda, [Vercel](https://vercel.com/) or [Serverless](https://www.serverless.com/), you need to ensure that all events are sent before responding to the request.

```javascript
const Windsor = require("windsor-node");
const windsor = new Windsor("token");

exports.handler = async (event) => {
  let greeting = "";
  if (event.queryStringParameters && event.queryStringParameters.greeting) {
    console.log("Received greeting: " + event.queryStringParameters.greeting);
    greeting = event.queryStringParameters.greeting;
  }

  // A promise is returned, but instead of using await here
  // we can send multiple analytics events and then await a single
  // call to windsor.flush() before returning the response
  windsor.event({
    event: "Sent Greeting",
    properties: {
      greeting,
    },
  });

  const message = `${greeting} World.`;
  const responseBody = { message };
  const response = {
    statusCode: 200,
    body: JSON.stringify(responseBody),
  };

  await windsor.flush();
  return response;
};
```

## Documentation

Documentation is available at [https://docs.windsor.io/docs/analytics](https://docs.windsor.io/docs/analytics)

## License

Copyright &copy; 2020 Windsor Software Inc. \<team@windsor.io\>

See the LICENSE file for details and see the SEGMENT_LICENSE file attribution to the [Segment Library](https://github.com/segmentio/analytics-node) this was based off.
