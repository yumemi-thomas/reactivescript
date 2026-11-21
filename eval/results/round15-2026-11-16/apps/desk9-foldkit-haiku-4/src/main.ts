import { Match, Option, Schema } from 'effect'
import { Command, Runtime, type Update } from 'foldkit'
import { Document, Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

import * as HelpPage from './help'
import * as IssuesPage from './issues'
import * as SettingsPage from './settings'

// MODEL

const Tab = Schema.Literals(['Issues', 'Help', 'Settings'])
type Tab = typeof Tab.Type

const Page = defineTaggedUnion({
  Issues: { model: IssuesPage.Model },
  Help: { model: HelpPage.Model },
  Settings: { model: SettingsPage.Model },
})
type Page = typeof Page.Type

export const Model = Schema.Struct({
  page: Page,
  maybeOpenIssueCount: Schema.Option(Schema.Number),
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  ClickedTab: { tab: Tab },
  GotIssuesMessage: { message: IssuesPage.Message },
  GotHelpMessage: { message: HelpPage.Message },
  GotSettingsMessage: { message: SettingsPage.Message },
})
export type Message = typeof Message.Type

// INIT

const toIssuesMessage = (message: IssuesPage.Message) =>
  Message.GotIssuesMessage({ message })

const toHelpMessage = (message: HelpPage.Message) =>
  Message.GotHelpMessage({ message })

const toSettingsMessage = (message: SettingsPage.Message) =>
  Message.GotSettingsMessage({ message })

const withPage = (model: Model, page: Page): Model =>
  modifyFields(model, { page: () => page })

const openTab = (model: Model, tab: Tab): Update.Return<Model, Message> =>
  Match.value(tab).pipe(
    Match.when('Issues', () => {
      const issuesInit = IssuesPage.init()
      return {
        model: withPage(
          model,
          Page.Issues({ model: issuesInit.model }),
        ),
        commands: Command.mapMessages(issuesInit.commands, toIssuesMessage),
      }
    }),
    Match.when('Help', () => {
      const helpInit = HelpPage.init()
      return {
        model: withPage(model, Page.Help({ model: helpInit.model })),
      }
    }),
    Match.when('Settings', () => {
      const settingsInit = SettingsPage.init()
      return {
        model: withPage(
          model,
          Page.Settings({ model: settingsInit.model }),
        ),
        commands: Command.mapMessages(
          settingsInit.commands,
          toSettingsMessage,
        ),
      }
    }),
    Match.exhaustive,
  )

const isOnTab = (page: Page, tab: Tab): boolean =>
  (page._tag === 'Issues' && tab === 'Issues') ||
  (page._tag === 'Help' && tab === 'Help') ||
  (page._tag === 'Settings' && tab === 'Settings')

export const init: Runtime.ApplicationInit<Model, Message> = () =>
  openTab(
    {
      page: Page.Issues({ model: IssuesPage.init().model }),
      maybeOpenIssueCount: Option.none(),
    },
    'Issues',
  )

// UPDATE

const openRelatedHelp = (
  model: Model,
  query: string,
  hitId: number,
): Update.Return<Model, Message> => {
  const helpOpened = HelpPage.openRelated(query, hitId)
  return {
    model: withPage(model, Page.Help({ model: helpOpened.model })),
    commands: Command.mapMessages(helpOpened.commands, toHelpMessage),
  }
}

export const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedTab: ({ tab }) =>
      isOnTab(model.page, tab) ? { model } : openTab(model, tab),

    GotIssuesMessage: ({ message: issuesMessage }) => {
      if (model.page._tag !== 'Issues') {
        return { model }
      }
      const issuesResult = IssuesPage.update(model.page.model, issuesMessage)
      if (issuesResult.outMessage !== undefined) {
        return IssuesPage.OutMessage.match<Update.Return<Model, Message>>(
          issuesResult.outMessage,
          {
            OpenedRelatedHelp: ({ query, hitId }) =>
              openRelatedHelp(model, query, hitId),
          },
        )
      }
      const nextMaybeOpenIssueCount = IssuesPage.openIssueCount(
        issuesResult.model,
      )
      return {
        model: modifyFields(model, {
          page: () => Page.Issues({ model: issuesResult.model }),
          maybeOpenIssueCount: maybeCount =>
            Option.isSome(nextMaybeOpenIssueCount)
              ? nextMaybeOpenIssueCount
              : maybeCount,
        }),
        commands: Command.mapMessages(issuesResult.commands, toIssuesMessage),
      }
    },

    GotHelpMessage: ({ message: helpMessage }) => {
      if (model.page._tag !== 'Help') {
        return { model }
      }
      const helpResult = HelpPage.update(model.page.model, helpMessage)
      return {
        model: withPage(model, Page.Help({ model: helpResult.model })),
        commands: Command.mapMessages(helpResult.commands, toHelpMessage),
      }
    },

    GotSettingsMessage: ({ message: settingsMessage }) => {
      if (model.page._tag !== 'Settings') {
        return { model }
      }
      const settingsResult = SettingsPage.update(
        model.page.model,
        settingsMessage,
      )
      return {
        model: withPage(
          model,
          Page.Settings({ model: settingsResult.model }),
        ),
        commands: Command.mapMessages(
          settingsResult.commands,
          toSettingsMessage,
        ),
      }
    },
  })

// VIEW

const issuesTabLabel = (model: Model): string =>
  Option.match(model.maybeOpenIssueCount, {
    onNone: () => 'Issues',
    onSome: count => `Issues (${count})`,
  })

const viewTab = (
  tab: Tab,
  testIdValue: string,
  label: string,
  h: HtmlBuilder<Message>,
): Html =>
  h.button(
    [
      h.DataAttribute('testid', testIdValue),
      h.Type('button'),
      h.OnClick(Message.ClickedTab({ tab })),
    ],
    [label],
  )

const viewPage = (model: Model, h: HtmlBuilder<Message>): Html =>
  Match.value(model.page).pipe(
    Match.tagsExhaustive({
      Issues: ({ model: issuesModel }) =>
        h.submodel({
          slotId: 'issues',
          model: issuesModel,
          view: IssuesPage.view,
          toParentMessage: toIssuesMessage,
        }),
      Help: ({ model: helpModel }) =>
        h.submodel({
          slotId: 'help',
          model: helpModel,
          view: HelpPage.view,
          toParentMessage: toHelpMessage,
        }),
      Settings: ({ model: settingsModel }) =>
        h.submodel({
          slotId: 'settings',
          model: settingsModel,
          view: SettingsPage.view,
          toParentMessage: toSettingsMessage,
        }),
    }),
  )

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: 'Issue desk',
  body: h.div(
    [h.Class('min-h-screen p-6 space-y-6')],
    [
      h.nav(
        [h.Class('flex gap-2 border-b pb-2')],
        [
          viewTab('Issues', 'tab-issues', issuesTabLabel(model), h),
          viewTab('Help', 'tab-help', 'Help', h),
          viewTab('Settings', 'tab-settings', 'Settings', h),
        ],
      ),
      viewPage(model, h),
    ],
  ),
})
