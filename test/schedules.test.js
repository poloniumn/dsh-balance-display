import test from 'node:test'
import assert from 'node:assert/strict'

import { parseDeepseekPeak, parseMimoNight } from '../lib/schedules.js'
import { parseBadges, parseWindow } from '../lib/qwen-discount.js'

test('DeepSeek peak windows come from the pricing page copy', () => {
  const text = '北京时间周一至周五（不含中国法定节假日）9:00 - 12:00、14:00 - 18:00'
  assert.deepEqual(parseDeepseekPeak(text).windows, [
    { startMinute: 540, endMinute: 720 },
    { startMinute: 840, endMinute: 1080 },
  ])
  assert.equal(parseDeepseekPeak('nothing here'), null)
})

test('MiMo night window and rate come from the plan FAQ', () => {
  const text = '非高峰期（北京时间 0:00-8:00，即 UTC 16:00-24:00） 0.8x Credits 消耗系数'
  const parsed = parseMimoNight(text)
  assert.equal(parsed.discount, '8')
  assert.deepEqual(parsed.window, { startHour: 0, startMinute: 0, endHour: 8, endMinute: 0 })
  assert.equal(parseMimoNight('nothing here'), null)
})

const catalog = [
  {
    modelId: 'auto',
    name: '{"zh-CN":"Auto"}',
    badgeLabel: '限时夜间4折',
    badgeDescription: '每晚 22:00 - 次日 08:00 期间调用模型，Credits 消耗低至 4 折。',
  },
  { modelId: 'qwen3.8-max', name: '{"zh-CN":"Qwen3.8-Max"}', badgeLabel: 'New', badgeDescription: '' },
  {
    modelId: 'deepseek-v3-0715',
    name: '{"zh-CN":"DeepSeek-V3-0715"}',
    badgeLabel: '限时夜间5折',
    badgeDescription: '每晚 22:00 - 次日 08:00 期间调用模型，Credits 消耗低至 5 折。',
  },
]

test('Qwen badges collapse to the model the console marks', () => {
  assert.deepEqual(parseBadges(catalog), [
    { discount: '4', models: ['Auto'] },
    { discount: '5', models: ['DeepSeek-V3'] },
  ])
})

test('Qwen window is read from the badge copy', () => {
  assert.deepEqual(parseWindow(catalog), { startHour: 22, startMinute: 0, endHour: 8, endMinute: 0 })
  assert.equal(parseWindow([]), null)
})