import { type Runtime } from 'foldkit'

import { Message } from './message'
import { Model } from './model'
import { initBoard, update } from './update'
import { view } from './view'

// INIT

export const init: Runtime.ApplicationInit<Model, Message> = () => initBoard(0)

export { Message, Model, update, view }
