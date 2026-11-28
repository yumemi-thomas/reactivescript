import { Runtime } from 'foldkit'

import { Message } from './message'
import { Model } from './model'
import { init as initApp, update } from './update'
import { view } from './view'

// NOTE: The definitions live in their own modules; this module gathers them
// for the runtime entry point and for tests.

export { Message, Model, update, view }

export const init: Runtime.ApplicationInit<Model, Message> = () => initApp()
