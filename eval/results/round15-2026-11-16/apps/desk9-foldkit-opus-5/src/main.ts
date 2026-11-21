import { Option, Schema } from 'effect'
import { type Runtime, Update } from 'foldkit'
import { type Document, type Html, type HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

import * as Help from './page/help'
import * as Issues from './page/issues'
import * as Settings from './page/settings'

// MODEL

export const Tab = Schema.Literals(['issues', 'help', 'settings'])
export type Tab = typeof Tab.Type

export const Page = defineTaggedUnion({
  Issues: { instance: Schema.Number, issues: Issues.Model },
  Help: { instance: Schema.Number, help: Help.Model },
  Settings: { instance: Schema.Number, settings: Settings.Model },
})
export type Page = typeof Page.Type

export const Model = Schema.Struct({
  page: Page,
  lastInstance: Schema.Number,
  maybeOpenIssueCount: Schema.Option(Schema.Number),
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  ClickedTab: { tab: Tab },
  GotIssuesMessage: { instance: Schema.Number, message: Issues.Message },
  GotHelpMessage: { instance: Schema.Number, message: Help.Message },
  GotSettingsMessage: { instance: Schema.Number, message: Settings.Message },
})
export type Message = typeof Message.Type

// PAGES

type UpdateReturn = Update.Return<Model, Message>

const writeIssuesPage = (
  model: Model,
  instance: number,
  issues: Issues.Model,
): Model =>
  modifyFields(model, {
    page: () => Page.Issues({ instance, issues }),
    maybeOpenIssueCount: maybeOpenIssueCount =>
      Option.orElse(
        Issues.openIssueCount(issues),
        () => maybeOpenIssueCount,
      ),
  })

const writeHelpPage = (model: Model, instance: number, help: Help.Model) =>
  modifyFields(model, { page: () => Page.Help({ instance, help }) })

const writeSettingsPage = (
  model: Model,
  instance: number,
  settings: Settings.Model,
) => modifyFields(model, { page: () => Page.Settings({ instance, settings }) })

const nextInstance = (model: Model): number => model.lastInstance + 1

const withInstance = (model: Model, instance: number): Model =>
  modifyFields(model, { lastInstance: () => instance })

const openHelp = (model: Model, helpInit: Update.Return<Help.Model, Help.Message>) => {
  const instance = nextInstance(model)
  return Update.foldChildInit(helpInit, {
    toParentModel: help =>
      writeHelpPage(withInstance(model, instance), instance, help),
    toParentMessage: message => Message.GotHelpMessage({ instance, message }),
  })
}

const openSettings = (model: Model): UpdateReturn => {
  const instance = nextInstance(model)
  return Update.foldChildInit(Settings.init(), {
    toParentModel: settings =>
      writeSettingsPage(withInstance(model, instance), instance, settings),
    toParentMessage: message =>
      Message.GotSettingsMessage({ instance, message }),
  })
}

const openIssues = (model: Model): UpdateReturn => {
  const instance = nextInstance(model)
  return Update.foldChildInit(Issues.init(), {
    toParentModel: issues =>
      writeIssuesPage(withInstance(model, instance), instance, issues),
    toParentMessage: message => Message.GotIssuesMessage({ instance, message }),
  })
}

const currentTab = (page: Page): Tab =>
  Page.match<Tab>(page, {
    Issues: () => 'issues',
    Help: () => 'help',
    Settings: () => 'settings',
  })

// INIT

const FIRST_INSTANCE = 1

export const init: Runtime.ApplicationInit<Model, Message> = () =>
  Update.foldChildInit(Issues.init(), {
    toParentModel: issues => ({
      page: Page.Issues({ instance: FIRST_INSTANCE, issues }),
      lastInstance: FIRST_INSTANCE,
      maybeOpenIssueCount: Issues.openIssueCount(issues),
    }),
    toParentMessage: message =>
      Message.GotIssuesMessage({ instance: FIRST_INSTANCE, message }),
  })

// UPDATE

const foldIssuesOutMessage = Issues.OutMessage.match<
  Update.Step<Model, Message>
>({
  OpenedRelatedHit:
    ({ query, hitId }) =>
    model =>
      openHelp(model, Help.initWithHit(query, hitId)),
})

const foldIssues = (instance: number) =>
  Update.foldChild({
    update: Issues.update,
    read: (model: Model) =>
      model.page._tag === 'Issues' && model.page.instance === instance
        ? Option.some(model.page.issues)
        : Option.none(),
    write: (model, nextIssues) => writeIssuesPage(model, instance, nextIssues),
    toParentMessage: message => Message.GotIssuesMessage({ instance, message }),
    foldOutMessage: foldIssuesOutMessage,
  })

const foldHelp = (instance: number) =>
  Update.foldChild({
    update: Help.update,
    read: (model: Model) =>
      model.page._tag === 'Help' && model.page.instance === instance
        ? Option.some(model.page.help)
        : Option.none(),
    write: (model, nextHelp) => writeHelpPage(model, instance, nextHelp),
    toParentMessage: message => Message.GotHelpMessage({ instance, message }),
  })

const foldSettings = (instance: number) =>
  Update.foldChild({
    update: Settings.update,
    read: (model: Model) =>
      model.page._tag === 'Settings' && model.page.instance === instance
        ? Option.some(model.page.settings)
        : Option.none(),
    write: (model, nextSettings) =>
      writeSettingsPage(model, instance, nextSettings),
    toParentMessage: message =>
      Message.GotSettingsMessage({ instance, message }),
  })

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    ClickedTab: ({ tab }) => {
      if (tab === currentTab(model.page)) {
        return { model }
      }
      if (tab === 'issues') {
        return openIssues(model)
      }
      if (tab === 'help') {
        return openHelp(model, Help.init())
      }
      return openSettings(model)
    },

    GotIssuesMessage: ({ instance, message }) =>
      foldIssues(instance)(model, message),

    GotHelpMessage: ({ instance, message }) =>
      foldHelp(instance)(model, message),

    GotSettingsMessage: ({ instance, message }) =>
      foldSettings(instance)(model, message),
  })

// VIEW

const tabLabel = (tab: Tab, model: Model): string => {
  if (tab === 'issues') {
    return Option.match(model.maybeOpenIssueCount, {
      onNone: () => 'Issues',
      onSome: count => `Issues (${count})`,
    })
  }
  return tab === 'help' ? 'Help' : 'Settings'
}

const tabView = (tab: Tab, model: Model, h: HtmlBuilder<Message>): Html => {
  const isCurrent = tab === currentTab(model.page)
  return h.button(
    [
      h.Type('button'),
      h.DataAttribute('testid', `tab-${tab}`),
      h.Class(isCurrent ? 'tab current' : 'tab'),
      h.AriaPressed(isCurrent ? 'true' : 'false'),
      h.OnClick(Message.ClickedTab({ tab })),
    ],
    [tabLabel(tab, model)],
  )
}

const pageView = (page: Page, h: HtmlBuilder<Message>): Html =>
  Page.match<Html>(page, {
    Issues: ({ instance, issues }) =>
      h.submodel({
        slotId: `issues-${instance}`,
        model: issues,
        view: Issues.view,
        toParentMessage: message =>
          Message.GotIssuesMessage({ instance, message }),
      }),
    Help: ({ instance, help }) =>
      h.submodel({
        slotId: `help-${instance}`,
        model: help,
        view: Help.view,
        toParentMessage: message => Message.GotHelpMessage({ instance, message }),
      }),
    Settings: ({ instance, settings }) =>
      h.submodel({
        slotId: `settings-${instance}`,
        model: settings,
        view: Settings.view,
        toParentMessage: message =>
          Message.GotSettingsMessage({ instance, message }),
      }),
  })

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: 'Issue desk',
  body: h.div(
    [h.Class('desk')],
    [
      h.nav(
        [h.Class('tabs'), h.AriaLabel('Pages')],
        [
          tabView('issues', model, h),
          tabView('help', model, h),
          tabView('settings', model, h),
        ],
      ),
      h.main([h.Class('page-area')], [pageView(model.page, h)]),
    ],
  ),
})
