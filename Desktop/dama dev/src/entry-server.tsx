import { createStartHandler } from '@tanstack/react-start/server'
import { getRouterManifest } from '@tanstack/react-start/router-manifest'
import { getRouter } from './router'

export default createStartHandler({
  createRouter: getRouter,
  getRouterManifest,
})
