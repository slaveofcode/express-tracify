import { Request, Response } from 'express'
import { Tags } from 'opentracing'
import Rewire from 'rewire'
import { Init } from '.'
import { middleware } from './middlewares'



const mockRequest = () => {
  return {
    headers: {},
    get: jest.fn().mockReturnValue(''),
    opentracing: {},
  } as unknown as Request
}

const mockResponse = () => {
  const res = {
    on: jest.fn(),
  } as unknown as Response
  return res
}

test('Middleware should throw error when no tracer initialized', () => {
  const fn = () => middleware()
  expect(fn).toThrowError('You have to set `Init()` before use the middleware')
})

test('Middleware should return valid express middleware', () => {
  Init({
    tracer: {
      config: {
        serviceName: 'test',
      },
    },
  })

  const fn = middleware()
  const mockedNext = jest.fn()
  const res = mockResponse()

  fn(mockRequest(), res, mockedNext)

  expect(mockedNext).toHaveBeenCalled()
  expect(res.on).toHaveBeenCalledWith('finish', expect.anything())
})

test('makeFinish should able to set state span finished', () => {
  const m = Rewire('./middlewares')
  const makeFinish = m.__get__('makeFinish')

  const mockSpan = {
    setTag: jest.fn(),
    finish: jest.fn(),
    log: jest.fn(),
  }

  makeFinish(mockSpan, {}, { statusCode: 200 })()

  expect(mockSpan.finish).toHaveBeenCalled()
  expect(mockSpan.setTag).toHaveBeenCalledWith(Tags.HTTP_STATUS_CODE, 200)
  expect(mockSpan.log).toHaveBeenCalledWith({
    event: 'request-ended',
  })
})

test('makeFinish should able to set error state span', () => {
  const m = Rewire('./middlewares')
  const makeFinish = m.__get__('makeFinish')

  const mockSpan = {
    setTag: jest.fn(),
    finish: jest.fn(),
    log: jest.fn(),
  }

  makeFinish(mockSpan, {}, {
    statusCode: m.__get__('ERR_STATUS_CODE'),
    statusMessage: 'Bad Request',
  }, () => true)()

  expect(mockSpan.setTag).toHaveBeenNthCalledWith(1, Tags.SAMPLING_PRIORITY, 1)
  expect(mockSpan.setTag).toHaveBeenNthCalledWith(2, Tags.ERROR, true)
  expect(mockSpan.log).toHaveBeenNthCalledWith(1, {
    event: 'error.status_message',
    message: 'Bad Request',
  })
})
