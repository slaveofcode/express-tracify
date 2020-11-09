import { Request, Response, NextFunction } from 'express'
import { Tags } from 'opentracing'
import Rewire from 'rewire'
// import { TracerWrapper } from './tracer_wrapper'

afterEach(() => jest.clearAllMocks())

test('spanSafeFinish should be able to detect finish calling before', () => {
  const m = Rewire('./tracer_wrapper')
  const spanSafeFinish = m.__get__('spanSafeFinish')

  const mockedSpan1 = {
    _duration: 0,
    finish: jest.fn(),
  }

  const mockedSpan2 = {
    _duration: 1,
    finish: jest.fn(),
  }

  spanSafeFinish(mockedSpan1)
  spanSafeFinish(mockedSpan2)

  expect(mockedSpan1.finish).toHaveBeenCalledTimes(1)
  expect(mockedSpan2.finish).toHaveBeenCalledTimes(0)
})

test('finishWithErr should able to finish with set error state span', () => {
  const m = Rewire('./tracer_wrapper')
  const finishWithErr = m.__get__('finishWithErr')

  const mockSpan = {
    setTag: jest.fn(),
    finish: jest.fn(),
    log: jest.fn(),
  }

  finishWithErr(new Error('Something Wrong'), mockSpan)

  expect(mockSpan.setTag).toHaveBeenNthCalledWith(1, Tags.ERROR, true)
  expect(mockSpan.setTag).toHaveBeenNthCalledWith(2, Tags.SAMPLING_PRIORITY, 1)
  expect(mockSpan.log).toHaveBeenNthCalledWith(1, {
    event: 'error.message',
    message: 'Something Wrong',
  })
})

test('spanHandlerPromise should able call span finish on resolved promise', () => {
  const m = Rewire('./tracer_wrapper')
  const spanHandlerPromise = m.__get__('spanHandlerPromise')

  const mockSpan = { finish: jest.fn() }

  const fn = new Promise((res, _rej) => {
    res({ success: true })
  })

  return spanHandlerPromise(mockSpan, fn)
    .then(() => {
      expect(mockSpan.finish).toHaveBeenCalled()
    })
})

test('spanHandlerPromise should able call span finish on rejected promise', () => {
  const m = Rewire('./tracer_wrapper')
  const spanHandlerPromise = m.__get__('spanHandlerPromise')

  const mockSpan = {
    setTag: jest.fn(),
    finish: jest.fn(),
    log: jest.fn(),
  }

  const wrapFn = () => {
    const fn = new Promise((_res, rej) => {
      rej(new Error('Something Wrong'))
    })

    return spanHandlerPromise(mockSpan, fn)
  }

  return wrapFn().catch((err: Error) => {
    expect(err.message).toEqual('Something Wrong')
    expect(mockSpan.finish).toHaveBeenCalled()
  })
})

test('should be able to initialize new TraceWrapper object', () => {
  const m = Rewire('./tracer_wrapper')
  const TracerWrapper = m.__get__('TracerWrapper')

  const mockSpan = {
    context: expect.anything(),
  }

  const tw = new TracerWrapper({ span: mockSpan })

  expect(tw instanceof TracerWrapper).toEqual(true)
  expect(tw.getSpan()).toEqual(mockSpan)
})

test('should be able to create child span from TraceWrapper object', () => {
  const m = Rewire('./tracer_wrapper')
  const TracerWrapper = m.__get__('TracerWrapper')

  const mockSpan = {
    context: jest.fn(),
  }
  const tw = new TracerWrapper({ span: mockSpan })
  const childSpan = tw.createChildSpan('child')
  expect(childSpan.constructor.name).toEqual('Span')
})

test('TraceWrapper.traceFn should be able to trace a regular function', () => {
  const m = Rewire('./tracer_wrapper')
  const TracerWrapper = m.__get__('TracerWrapper')

  const mockSubFnSpan = {
    setTag: jest.fn(),
    finish: jest.fn(),
    log: jest.fn(),
  }

  const mockGlobTracer = {
    startSpan: jest.fn().mockReturnValue(mockSubFnSpan),
  }

  m.__set__('tracer', mockGlobTracer)

  const mockParentSpan = {
    context: () => undefined,
    finish: jest.fn(),
  }
  const tw = new TracerWrapper({ span: mockParentSpan })

  // tslint:disable-next-line: no-empty
  const someFunc = () => { }
  someFunc.apply = jest.fn()
  const tracedSomeFunc = tw.traceFn(someFunc, 'someFunc')

  const testFunc = jest.fn().mockImplementation((arg1: string) => `Hello ${arg1}`)
  const tracedTestFunc = tw.traceFn(testFunc, 'testFunc')

  tracedSomeFunc('test', 'one')
  const tracedFnRes = tracedTestFunc('test', 'one')

  expect(typeof tracedSomeFunc).toEqual('function')
  expect(typeof tracedTestFunc).toEqual('function')
  expect(someFunc.apply).toHaveBeenCalled()
  expect(someFunc.apply).toHaveBeenCalledWith(expect.anything(), ['test', 'one'])
  expect(testFunc).toHaveBeenCalled()
  expect(testFunc).toHaveBeenCalledWith('test', 'one')
  expect(mockGlobTracer.startSpan).toHaveBeenCalled()
  expect(mockGlobTracer.startSpan).toHaveBeenCalledWith('someFunc', {
    childOf: undefined,
  })
  expect(tracedFnRes).toEqual('Hello test')
  expect(mockSubFnSpan.finish).toHaveBeenCalled()
  expect(mockParentSpan.finish).not.toHaveBeenCalled()
})

test('TraceWrapper.traceFn should be able to trace a regular function with throw error', () => {
  const m = Rewire('./tracer_wrapper')
  const TracerWrapper = m.__get__('TracerWrapper')

  const mockSubFnSpan = {
    setTag: jest.fn(),
    finish: jest.fn(),
    log: jest.fn(),
  }

  const mockGlobTracer = {
    startSpan: jest.fn().mockReturnValue(mockSubFnSpan),
  }

  m.__set__('tracer', mockGlobTracer)

  const mockParentSpan = {
    context: () => undefined,
    setTag: jest.fn(),
    finish: jest.fn(),
    log: jest.fn(),
  }
  const tw = new TracerWrapper({ span: mockParentSpan })

  const testFunc = jest.fn().mockImplementation((arg1: string) => {
    throw new Error(`Error: ${arg1}`)
  })
  const tracedTestFunc = tw.traceFn(testFunc, 'testFunc')

  const wrapErr = () => {
    tracedTestFunc('test', 'one')
  }

  expect(wrapErr).toThrowError('Error: test')
  expect(mockParentSpan.finish).toHaveBeenCalled()
  expect(mockParentSpan.setTag).toHaveBeenNthCalledWith(1, Tags.ERROR, true)
  expect(mockParentSpan.setTag).toHaveBeenNthCalledWith(2, Tags.SAMPLING_PRIORITY, 1)
  expect(mockParentSpan.log).toHaveBeenNthCalledWith(1, {
    event: 'error.message',
    message: 'Error: test',
  })

  expect(mockSubFnSpan.finish).toHaveBeenCalled()
  expect(mockSubFnSpan.setTag).toHaveBeenNthCalledWith(1, Tags.ERROR, true)
  expect(mockSubFnSpan.setTag).toHaveBeenNthCalledWith(2, Tags.SAMPLING_PRIORITY, 1)
  expect(mockSubFnSpan.log).toHaveBeenNthCalledWith(1, {
    event: 'error.message',
    message: 'Error: test',
  })
})

test('TraceWrapper.traceFn should be able to trace a resolved promise function', () => {
  const m = Rewire('./tracer_wrapper')
  const TracerWrapper = m.__get__('TracerWrapper')

  const mockSubFnSpan = {
    setTag: jest.fn(),
    finish: jest.fn(),
    log: jest.fn(),
  }

  const mockGlobTracer = {
    startSpan: jest.fn().mockReturnValue(mockSubFnSpan),
  }

  m.__set__('tracer', mockGlobTracer)

  const mockParentSpan = {
    context: () => undefined,
    setTag: jest.fn(),
    finish: jest.fn(),
    log: jest.fn(),
  }
  const tw = new TracerWrapper({ span: mockParentSpan })

  const testFunc = jest.fn().mockImplementation(
    (arg1: string) => new Promise((res) => res(`Hello ${arg1}`)),
  )
  const tracedTestFunc = tw.traceFn(testFunc, 'testFunc')

  return tracedTestFunc('test', 'unusedArg').then((res: string) => {
    expect(mockSubFnSpan.finish).toHaveBeenCalled()
    expect(res).toEqual('Hello test')
    expect(mockParentSpan.finish).not.toHaveBeenCalled()
  })
})

test('TraceWrapper.traceFn should be able to trace a rejected promise function', () => {
  const m = Rewire('./tracer_wrapper')
  const TracerWrapper = m.__get__('TracerWrapper')

  const mockSubFnSpan = {
    setTag: jest.fn(),
    finish: jest.fn(),
    log: jest.fn(),
  }

  const mockGlobTracer = {
    startSpan: jest.fn().mockReturnValue(mockSubFnSpan),
  }

  m.__set__('tracer', mockGlobTracer)

  const mockParentSpan = {
    context: () => undefined,
    setTag: jest.fn(),
    finish: jest.fn(),
    log: jest.fn(),
  }
  const tw = new TracerWrapper({ span: mockParentSpan })

  const wrapErr = () => {
    const tracedTestFunc = tw.traceFn(
      (arg1: string) => new Promise((_, rej) => rej(new Error(`Error: ${arg1}`))),
      'testFunc',
    )

    return tracedTestFunc('test')
  }

  return wrapErr().catch((err: Error) => {
    expect(err.message).toEqual('Error: test')
    expect(mockSubFnSpan.finish).toHaveBeenCalled()
    expect(mockSubFnSpan.setTag).toHaveBeenNthCalledWith(1, Tags.ERROR, true)
    expect(mockSubFnSpan.setTag).toHaveBeenNthCalledWith(2, Tags.SAMPLING_PRIORITY, 1)
    expect(mockSubFnSpan.log).toHaveBeenNthCalledWith(1, {
      event: 'error.message',
      message: 'Error: test',
    })

    expect(mockParentSpan.finish).toHaveBeenCalled()
    expect(mockParentSpan.setTag).toHaveBeenNthCalledWith(1, Tags.ERROR, true)
    expect(mockParentSpan.setTag).toHaveBeenNthCalledWith(2, Tags.SAMPLING_PRIORITY, 1)
    expect(mockParentSpan.log).toHaveBeenNthCalledWith(1, {
      event: 'error.message',
      message: 'Error: test',
    })
  })
})

test('WrapHandler should return wrapped express handler', () => {
  const m = Rewire('./tracer_wrapper')
  const WrapHandler = m.__get__('WrapHandler')

  const fn = (_req: Request, res: Response, _next: NextFunction) => {
    return res.json({})
  }

  const wrappedFn = WrapHandler(fn)

  expect(typeof wrappedFn).toEqual('function')
})

test('WrapHandler should start & finish span within response methods', () => {
  const m = Rewire('./tracer_wrapper')
  const WrapHandler = m.__get__('WrapHandler')

  const resMethods = [
    'json',
    'jsonp',
    'send',
    'sendFile',
    'sendStatus',
    'end',
    'render',
    'redirect',
  ]
  for (const mtd of resMethods) {
    const mockSpan: any = {
      setTag: jest.fn(),
      log: jest.fn(),
    }

    mockSpan.finish = jest.fn().mockImplementation(() => {
      mockSpan.__duration = 999
    })

    const mockGlobTracer = {
      startSpan: jest.fn().mockReturnValue(mockSpan),
    }

    m.__set__('tracer', mockGlobTracer)

    const fn = (_req: Request, res: Response, _next: NextFunction) => {
      return (res as any)[mtd]()
    }
    const wrappedFn = WrapHandler(fn)

    expect(typeof wrappedFn).toEqual('function')

    const mockReq = {}
    const mockRes = {
      json: () => {
        expect(mockGlobTracer.startSpan).toHaveBeenCalled()
        expect(mockSpan.finish).toHaveBeenCalled()
      },
      jsonp: () => {
        expect(mockGlobTracer.startSpan).toHaveBeenCalled()
        expect(mockSpan.finish).toHaveBeenCalled()
      },
      send: () => {
        expect(mockGlobTracer.startSpan).toHaveBeenCalled()
        expect(mockSpan.finish).toHaveBeenCalled()
      },
      sendStatus: () => {
        expect(mockGlobTracer.startSpan).toHaveBeenCalled()
        expect(mockSpan.finish).toHaveBeenCalled()
      },
      sendFile: () => {
        expect(mockGlobTracer.startSpan).toHaveBeenCalled()
        expect(mockSpan.finish).toHaveBeenCalled()
      },
      end: () => {
        expect(mockGlobTracer.startSpan).toHaveBeenCalled()
        expect(mockSpan.finish).toHaveBeenCalled()
      },
      render: () => {
        expect(mockGlobTracer.startSpan).toHaveBeenCalled()
        expect(mockSpan.finish).toHaveBeenCalled()
      },
      redirect: () => {
        expect(mockGlobTracer.startSpan).toHaveBeenCalled()
        expect(mockSpan.finish).toHaveBeenCalled()
      },
    }

    // tslint:disable-next-line: no-empty
    const mockNext = () => { }
    wrappedFn(mockReq, mockRes, mockNext)
  }
})

test('traceFn should trace the given function', () => {
  const m = Rewire('./tracer_wrapper')
  const WrapHandler = m.__get__('WrapHandler')

  const mockMiddlewareSpan: any = {
    context: jest.fn(),
  }

  mockMiddlewareSpan.finish = jest.fn().mockImplementation(() => {
    mockMiddlewareSpan.__duration = 999
  })

  const mockTracerWrapperSpan: any = {
    context: jest.fn(),
    setTag: jest.fn(),
    finish: jest.fn(),
    log: jest.fn(),
  }

  const mockGlobTracer = {
    startSpan: jest.fn()
      .mockReturnValueOnce(mockMiddlewareSpan) // will be called on WrapHandler
      .mockReturnValueOnce(mockTracerWrapperSpan), // will be called on TracerWrapper.traceFn
  }

  m.__set__('tracer', mockGlobTracer)

  const exampleFn = jest.fn().mockReturnValue('Hello World!')

  function middlewareFn(this: any, _req: Request, _res: Response, _next: NextFunction) {
    const tracedFn = this.traceFn(exampleFn)
    const res = tracedFn()
    _res.json({ ok: true })

    expect(res).toEqual('Hello World!')
    expect(this.getSpan().finish).toHaveBeenCalled()
  }

  const mockRes = { json: jest.fn() }

  WrapHandler(middlewareFn)({}, mockRes, jest.fn())

  expect(exampleFn).toHaveBeenCalled()
  expect(mockGlobTracer.startSpan).toHaveBeenNthCalledWith(1, middlewareFn.name, { childOf: undefined })
  expect(mockGlobTracer.startSpan).toHaveBeenNthCalledWith(2, exampleFn.name, { childOf: undefined })
  expect(mockMiddlewareSpan.finish).toHaveBeenCalled()
  expect(mockTracerWrapperSpan.finish).toHaveBeenCalled()
})

test('traceFnExec should immediately execute the trace function', () => {
  const m = Rewire('./tracer_wrapper')
  const WrapHandler = m.__get__('WrapHandler')

  const mockMiddlewareSpan: any = {
    context: jest.fn(),
  }

  mockMiddlewareSpan.finish = jest.fn().mockImplementation(() => {
    mockMiddlewareSpan.__duration = 999
  })

  const mockTracerWrapperSpan: any = {
    context: jest.fn(),
    setTag: jest.fn(),
    finish: jest.fn(),
    log: jest.fn(),
  }

  const mockGlobTracer = {
    startSpan: jest.fn()
      .mockReturnValueOnce(mockMiddlewareSpan) // will be called on WrapHandler
      .mockReturnValueOnce(mockTracerWrapperSpan), // will be called on TracerWrapper.traceFn
  }

  m.__set__('tracer', mockGlobTracer)

  const exampleFn = jest.fn().mockReturnValue('Hello World!')

  function middlewareFn(this: any, _req: Request, _res: Response, _next: NextFunction) {
    return this.traceFnExec(exampleFn)
  }

  const result = WrapHandler(middlewareFn)({}, {}, jest.fn())

  expect(exampleFn).toHaveBeenCalled()
  expect(result).toEqual('Hello World!')
  expect(mockGlobTracer.startSpan).toHaveBeenNthCalledWith(1, middlewareFn.name, { childOf: undefined })
  expect(mockGlobTracer.startSpan).toHaveBeenNthCalledWith(2, exampleFn.name, { childOf: undefined })
  expect(mockMiddlewareSpan.finish).toHaveBeenCalled()
  expect(mockTracerWrapperSpan.finish).toHaveBeenCalled()
})

test('traceFn should be able to call function with given context', () => {
  const m = Rewire('./tracer_wrapper')
  const TracerWrapper = m.__get__('TracerWrapper')
  const WrapHandler = m.__get__('WrapHandler')

  const mockMiddlewareSpan: any = {
    context: jest.fn(),
  }

  mockMiddlewareSpan.finish = jest.fn().mockImplementation(() => {
    mockMiddlewareSpan.__duration = 999
  })

  const mockTracerWrapperSpan: any = {
    context: jest.fn(),
    setTag: jest.fn(),
    finish: jest.fn(),
    log: jest.fn(),
  }

  const mockGlobTracer = {
    startSpan: jest.fn()
      .mockReturnValueOnce(mockMiddlewareSpan) // will be called on WrapHandler
      .mockReturnValueOnce(mockTracerWrapperSpan), // will be called on TracerWrapper.traceFn
  }

  m.__set__('tracer', mockGlobTracer)

  class XOperation {
    operationName: string
    secretOperations: string[]

    constructor(name: string) {
      this.operationName = name
      this.secretOperations = []
    }

    secretOperation(operation: string) {
      this.secretOperations.push(operation)
      // tslint:disable-next-line: no-string-literal
      expect((this as any)['$__tracer']).not.toEqual(undefined)
      // tslint:disable-next-line: no-string-literal
      expect((this as any)['$__tracer'] instanceof TracerWrapper).toEqual(true)
      return this.flush()
    }

    flush() {
      return {
        operation: this.operationName,
        secrets: this.secretOperations,
      }
    }
  }

  function middlewareFn(this: any, _req: Request, _res: Response, _next: NextFunction) {
    const xOps = new XOperation('Poop')

    const tracedOps = this.traceFn(xOps.secretOperation, 'xOps.secretOperation', {
      context: xOps,
    })

    return tracedOps('dummy')
  }

  const result = WrapHandler(middlewareFn)({}, {}, jest.fn())

  expect(result).toEqual({
    operation: 'Poop',
    secrets: ['dummy'],
  })
})
