import { Effect, Schema } from 'effect'
import { Command } from 'foldkit'

import {
  addCard,
  addItem,
  archiveCard,
  fetchArchived,
  fetchCards,
  fetchChecklist,
  moveCard,
  renameCard,
  restoreCard,
  toggleItem,
} from './api.js'
import { Message } from './message'
import { Archived, Card, Column } from './model'

// COMMAND

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export const FetchCards = Command.define('FetchCards', {
  args: { session: Schema.Number, column: Column },
  messages: [Message.SucceededFetchCards, Message.FailedFetchCards],
  execute: ({ session, column }) =>
    Effect.promise(() =>
      fetchCards(column).then(
        cards => Message.SucceededFetchCards({ session, column, cards }),
        error =>
          Message.FailedFetchCards({
            session,
            column,
            error: errorMessage(error),
          }),
      ),
    ),
})

export const MoveCard = Command.define('MoveCard', {
  args: {
    session: Schema.Number,
    id: Schema.Number,
    column: Column,
    index: Schema.Number,
    fromColumn: Column,
    fromIndex: Schema.Number,
  },
  messages: [Message.SucceededMoveCard, Message.FailedMoveCard],
  execute: ({ session, id, column, index, fromColumn, fromIndex }) =>
    Effect.promise(() =>
      moveCard(id, column, index).then(
        () => Message.SucceededMoveCard({ session }),
        error =>
          Message.FailedMoveCard({
            session,
            id,
            fromColumn,
            fromIndex,
            error: errorMessage(error),
          }),
      ),
    ),
})

export const AddCard = Command.define('AddCard', {
  args: { session: Schema.Number, key: Schema.Number, title: Schema.String },
  messages: [Message.SucceededAddCard, Message.FailedAddCard],
  execute: ({ session, key, title }) =>
    Effect.promise(() =>
      addCard('todo', title).then(
        added =>
          Message.SucceededAddCard({
            session,
            key,
            card: { id: added.id, title: added.title, done: 0, total: 0 },
          }),
        error =>
          Message.FailedAddCard({
            session,
            key,
            error: errorMessage(error),
          }),
      ),
    ),
})

export const RenameCard = Command.define('RenameCard', {
  args: {
    session: Schema.Number,
    id: Schema.Number,
    title: Schema.String,
    previousTitle: Schema.String,
  },
  messages: [Message.SucceededRenameCard, Message.FailedRenameCard],
  execute: ({ session, id, title, previousTitle }) =>
    Effect.promise(() =>
      renameCard(id, title).then(
        () => Message.SucceededRenameCard({ session }),
        error =>
          Message.FailedRenameCard({
            session,
            id,
            previousTitle,
            error: errorMessage(error),
          }),
      ),
    ),
})

export const ArchiveCard = Command.define('ArchiveCard', {
  args: {
    session: Schema.Number,
    card: Card,
    column: Column,
    index: Schema.Number,
  },
  messages: [Message.SucceededArchiveCard, Message.FailedArchiveCard],
  execute: ({ session, card, column, index }) =>
    Effect.promise(() =>
      archiveCard(card.id).then(
        () => Message.SucceededArchiveCard({ session }),
        error =>
          Message.FailedArchiveCard({
            session,
            card,
            column,
            index,
            error: errorMessage(error),
          }),
      ),
    ),
})

export const FetchChecklist = Command.define('FetchChecklist', {
  args: { session: Schema.Number, cardId: Schema.Number },
  messages: [Message.SucceededFetchChecklist, Message.FailedFetchChecklist],
  execute: ({ session, cardId }) =>
    Effect.promise(() =>
      fetchChecklist(cardId).then(
        items => Message.SucceededFetchChecklist({ session, cardId, items }),
        error =>
          Message.FailedFetchChecklist({
            session,
            cardId,
            error: errorMessage(error),
          }),
      ),
    ),
})

export const ToggleItem = Command.define('ToggleItem', {
  args: {
    session: Schema.Number,
    cardId: Schema.Number,
    itemId: Schema.Number,
    done: Schema.Boolean,
    previousDone: Schema.Boolean,
  },
  messages: [Message.SucceededToggleItem, Message.FailedToggleItem],
  execute: ({ session, cardId, itemId, done, previousDone }) =>
    Effect.promise(() =>
      toggleItem(cardId, itemId, done).then(
        () => Message.SucceededToggleItem({ session }),
        error =>
          Message.FailedToggleItem({
            session,
            cardId,
            itemId,
            previousDone,
            error: errorMessage(error),
          }),
      ),
    ),
})

export const AddItem = Command.define('AddItem', {
  args: {
    session: Schema.Number,
    cardId: Schema.Number,
    key: Schema.Number,
    text: Schema.String,
  },
  messages: [Message.SucceededAddItem, Message.FailedAddItem],
  execute: ({ session, cardId, key, text }) =>
    Effect.promise(() =>
      addItem(cardId, text).then(
        item => Message.SucceededAddItem({ session, cardId, key, item }),
        error =>
          Message.FailedAddItem({
            session,
            cardId,
            key,
            error: errorMessage(error),
          }),
      ),
    ),
})

export const FetchArchived = Command.define('FetchArchived', {
  args: { session: Schema.Number },
  messages: [Message.SucceededFetchArchived, Message.FailedFetchArchived],
  execute: ({ session }) =>
    Effect.promise(() =>
      fetchArchived().then(
        cards => Message.SucceededFetchArchived({ session, cards }),
        error =>
          Message.FailedFetchArchived({
            session,
            error: errorMessage(error),
          }),
      ),
    ),
})

export const RestoreCard = Command.define('RestoreCard', {
  args: {
    session: Schema.Number,
    archived: Archived,
    index: Schema.Number,
  },
  messages: [Message.SucceededRestoreCard, Message.FailedRestoreCard],
  execute: ({ session, archived, index }) =>
    Effect.promise(() =>
      restoreCard(archived.id).then(
        () => Message.SucceededRestoreCard({ session }),
        error =>
          Message.FailedRestoreCard({
            session,
            archived,
            index,
            error: errorMessage(error),
          }),
      ),
    ),
})
