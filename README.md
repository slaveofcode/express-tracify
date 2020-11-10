# Express Tracify
Library to support tracing with jaeger &amp; opentracing on NodeJs with ExpressJs. This library is divided into 3 parts:

1. Initialization
2. Middlewares (start & finish span, error capture)
3. Manual trace function

### Installation

#### NPM

```
$ npm i express-tracify
```

#### Init & Middleware Configuration

The example code below is using configuration via a direct parameter on the `Init` function, however, you can also use *Environment Variables* to set them. 

This library using [jaeger-client-node](https://github.com/jaegertracing/jaeger-client-node) and [opentracing](https://github.com/opentracing/opentracing-javascript) on the implementation, so the parameter for *config* or *options* is also the same.


```js
const Express = require('express')
const { Init, Middleware, ErrMiddlewareWrapper } = require('@usetada/express-tracify')

// part 1: initialization
Init({
  tracer: {
    config: {
      serviceName: 'SVC 1',
      sampler: {
        type: 'const',
        param: 1,
      },
    },
    options: {}
  }
})

const app = Express()

// part 2: middleware to create default request (auto start & finish span) 
app.use(Middleware())

// You ExpressJs HTTP handlers

// part 2: middleware to wrap error handler
app.use(ErrMiddlewareWrapper((err, req, res, next) => {
  return res.status(500).json({
    error: true,
    message: 'Something Wrong!',
  })
}))

```

### Trace Function
Function tracing is also possible by wrapping your function handler with `WrapHandler`

```js
const { WrapHandler } = require('@usetada/express-tracify')

const Home = WrapHandler(function (req, res) {
  res.json({
    page: 'Home',
  })
}, 'Home Handler')

app.get('/', Home)
```

This example will automatically add a new span with the name *Home Handler*.

### Traceable Sub-function
The advantage of wrapping your function handler with `WrapHandler` is you can also create another function tracing by using **traceFn**, but this function only available when your handler is not using *fat-arrow* style, because it will use the injected *(this)* context.

Following the previous example

```js
const getFromDB = () => {
  // some process to trace
}

// part 3: manual trace on function
const Home = WrapHandler(async function (req, res) {
  const TgetFromDB = this.traceFn(getFromDB, 'getFromDB') // set span Name 'getFromDB' 

  const data = await TgetFromDB()

  res.json({
    page: 'Home',
    data,
  })
}, 'Home Handler')
```

You'll notice the `getFromDB` function is using fat-arrow, it's impossible to call *(this)* in the context, by changing it to a non-fat-arrow function, you can call the `traceFn` from inside the function.

```js
function addLog() {
  // some logging
}

function getFromDB {
  // "this" is refers to TraceWrapper class
  // so calling .traceFn again in here is automatically
  // create new span, as a child of "getFromDB" span
  const TaddLog = this.traceFn(addLog)

  TaddLog('getting from DB')
  // some process to trace
}

const Home = WrapHandler(async function (req, res) {
  const TgetFromDB = this.traceFn(getFromDB) // span name 'getFromDB'

  const data = await TgetFromDB()

  res.json({
    page: 'Home',
    data,
  })
}, 'Home Handler')
```

by using *named function* **function getFromDB()** you don't have to set a custom span name like before, the function **getFromDB** itself now has a name, gathering from the constructor, and `traceFn` will use that name if the second parameter is not given.

If the function wrapped by `traceFn` is calling "this" again inside the operation, it will refer to the **TraceWrapper** class, which has the `traceFn` that can be used to do tracing deeply on more sub-functions.

### Prevent **"this"** context override
As you can see in the previous example, this library overrides the context of the current **"this"** object. If you working with a Class object where the operation is happening on the method calls, that would be a problem.

To handle that, you can insert additional context on the third parameter, and then you can use the tracer injected on the class method where stored on `$__tracer`.

```js
class Person {
  name;
  
  constructor(name) {
    this.name = name
  }

  sayName() {
    // use .traceFn via this.$__tracer.traceFn here
    console.log(`Hi ${this.name}`)
  }
}

WrapHandler(handler() {
  const p = new Person('aditya')

  const sayPersonName = this.traceFn(p.sayName, 'Person: sayName', { context: p })

  sayPersonName() // Hi aditya
})
```

### Apis

#### TracerWrapper
Base class for tracing functions

#### TracerWrapper.traceFn(fn, operationName, opts?: {context: Object })
Will return new traced function that ready to execute.
- `fn`: **Function** handler or function to trace (required)
- `operationName`: **String** Custom operation name, if not supplied will use `[TheFunction].name` value, or empty ("")
- `opts`: **Object** Options to pass
  - `context` **Object** the custom context to pass on `function.apply` calls

#### TracerWrapper.traceFnExec(fn, operationName, opts)
Same as `.traceFn` but will immediatelly execute the given function on `fn` param.


#### TracerWrapper.traceFns(fns)
Will return multiple traced functions, the order is based on the given functions parameter
- `fns`: **Array** array of parameter of `.traceFn`, the shorthand for creating multiple traced functions.

e.g.
```
const [tracedFn1, tracedFn2] = this.traceFns([
  [() => {}, 'function 1'],
  [() => {}, 'function 2', { context: this }]
])
```

#### TracerWrapper.getSpan()
Will return the current span object in the current context

#### TracerWrapper.createChildSpan(operationName, options)
Create new child span, based on the current span context
- `operationName`: **String** Operation name of new child span
- `options`: **Object** options to be assigned on `tracer.startSpan` execution (optional)

#### TracerWrapper.setOperationName(name)
Set custom operation name on the current span context
- `name`: **String** the name of operation

#### TracerWrapper.setTag(key, val)
Set opentracing Tag
- `key`: **String** Key name, refers to Opentracing.Tags
- `val`: **Any** value of the key tag

#### TracerWrapper.log(keyValuePairs, timestamp?: number)
Set logging value
- `keyValuePairs`: **Object{key: string, val: Any}** Key-Value pair of logging event
- `timestamp`: **Number** The timestamp in milliseconds since the Unix epoch (optional)

#### TracerWrapper.setTagPriority(priorityNumber = 1)
An alias for setting tag priority on `Tags.SAMPLING_PRIORITY`, by default 1 (priority)
- `priorityNumber`: **Number** the value of sampling priority **1** menas always captured

#### TracerWrapper.setTagError(errMsg)
Shorthand for easily create tag error and set sampling priority to 1
- `errMsg`: **String | Error** error message as a string or error object

#### TracerWrapper.setBaggageItem(key, value)
Set baggage item on the current trace context
- `key`: **String** key or the name of baggage item
- `value`: **String** the value of baggage item

#### TracerWrapper.getBaggageItem(key)
Get baggage item on the current trace context
- `key`: **String** key or the name of baggage item

### Examples
You can take a look at [example](./example) folder to see full implementations
