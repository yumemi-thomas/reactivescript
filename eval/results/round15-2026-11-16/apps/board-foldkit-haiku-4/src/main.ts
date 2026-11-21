import { Runtime } from 'foldkit'

import { Message } from './message'
import { Model } from './model'
import { startBoard, update } from './update'
import { view } from './view'

// INIT

export const init: Runtime.ApplicationInit<Model, Message> = () => startBoard(0)

export { Message, Model, update, view }
