/**
 * EAC router 的积分读数：宿主侧把 usage.badge 的 value 压成第三方区块的一行，
 * 卡片侧只负责按本地目录拼文案。这里验两边的纯函数——渠道表、金额聚合、
 * 单位不折算、以及文案拼装不越界。
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { OFM_CHANNELS, capacityPercent, createOfmCredits, mapOfmChannel } from '../lib/ofm-credits.js'

const channel = (id) => OFM_CHANNELS.find((row) => row.id === id)

const badge = (accounts) => ({ provider: 'x', generatedAt: Date.now(), accounts })

test('channel table matches our Free Model 的十渠道与其单位', () => {
  assert.equal(OFM_CHANNELS.length, 10)
  assert.deepEqual(
    OFM_CHANNELS.map((row) => [row.id, row.unit]),
    [
      ['lobsterai', 'credits'], ['qoder', 'credits'], ['qodercn', 'credits'],
      ['trae', 'credits'], ['cline', 'dollars'], ['loomy', 'credits'],
      ['raccoon', 'credits'], ['minimax', 'credits'], ['zcode', 'token'],
      ['gemini', 'quota'],
    ],
  )
  // 名字与 OFM 卡片一致，区块里不能出现裸 id。
  assert.equal(channel('gemini').name, 'Gemini')
  assert.equal(channel('qodercn').name, 'Qoder 中国版')
})

test('没有配置账号的渠道不出现在卡片上', () => {
  assert.equal(mapOfmChannel(channel('trae'), badge([])), null)
  assert.equal(mapOfmChannel(channel('trae'), undefined), null)
  assert.equal(mapOfmChannel(channel('trae'), {}), null)
})

test('多个账号的积分累加成一个总数', () => {
  const row = mapOfmChannel(channel('lobsterai'), badge([
    { accountId: 'a', balance: { total: 120 } },
    { accountId: 'b', balance: { total: 80 } },
    { accountId: 'c' }, // 没读到余额的账号不参与求和，也不该抹掉整行
  ]))
  assert.equal(row.ok, true)
  assert.equal(row.amount, 200)
  assert.equal(row.unit, 'credits')
  assert.equal(row.accounts, 2)
  assert.equal(row.id, 'ofm-lobsterai')
  assert.equal(row.kind, 'EAC router')
  assert.equal(row.source, 'ofm')
})

test('cline 报美元、zcode 报 token，单位原样带下去', () => {
  const dollars = mapOfmChannel(channel('cline'), badge([{ balance: { total: 3.5 } }]))
  assert.equal(dollars.unit, 'dollars')
  assert.equal(dollars.amount, 3.5)

  const tokens = mapOfmChannel(channel('zcode'), badge([{ balance: { total: 12_345 } }]))
  assert.equal(tokens.unit, 'token')
  assert.equal(tokens.amount, 12_345)
})

test('Gemini 的 total 是百分比相加，绝不当余额下发', () => {
  const row = mapOfmChannel(channel('gemini'), badge([
    { balance: { total: 180, packages: [{ name: '池 A', unit: 'quota', remaining: 40, total: 100, active: true }] } },
  ]))
  assert.equal(row.amount, null, 'quota 渠道不下发 total 求和')
  assert.equal(row.unit, 'quota')
  assert.equal(row.ok, true)
  assert.equal(row.remainPct, 40)
})

test('读不到任何额度时给 ok:false，让卡片显示失败而不是把渠道藏起来', () => {
  const row = mapOfmChannel(channel('loomy'), badge([
    { error: '积分查询失败（凭据失效或响应异常）' },
  ]))
  assert.equal(row.ok, false)
  assert.equal(row.amount, null)
  assert.equal(row.accounts, 0)
  assert.equal(row.name, 'Loomy')
})

test('capacityPercent 只认 total>0 且 remaining 在区间内的分桶', () => {
  assert.equal(capacityPercent(undefined), null)
  assert.equal(capacityPercent([]), null)
  assert.equal(capacityPercent([{ balance: {} }]), null)
  // 报不出容量的包不参与，也不编一个百分比。
  assert.equal(capacityPercent([{ balance: { packages: [{ remaining: 5, total: 0, active: true }] } }]), null)
  assert.equal(capacityPercent([{ balance: { packages: [{ remaining: 150, total: 100, active: true }] } }]), null)
  assert.equal(capacityPercent([{ balance: { packages: [{ remaining: 5, total: 100, active: false }] } }]), null)
  assert.equal(capacityPercent([{ balance: { packages: [{ remaining: 25, total: 100 }, { remaining: 75, total: 100 }] } }]), 50)
  // 停用的包跳过，剩下的照常算。
  assert.equal(capacityPercent([{ balance: { packages: [{ remaining: 10, total: 100, active: true }, { remaining: 0, total: 100, active: false }] } }]), 10)
})

test('卡片侧的 EAC router 文案全部来自本地目录，单位不折算', () => {
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  for (const key of ['ofm.credits', 'ofm.token', 'ofm.dollars', 'ofm.quota', 'ofm.accounts', 'ofm.failed']) {
    assert.match(client, new RegExp(`'${key}':`), `${key} 必须在 zh 与 en 两份目录里各出现一次`)
    assert.equal(client.split(`'${key}':`).length - 1, 2, `${key} 必须 zh/en 各一条`)
  }
  // 本地化只在卡片侧发生：宿主下发的是结构化字段，不是拼好的句子。
  assert.match(client, /item\.source === 'ofm'/)
  assert.match(client, /function ofmLabel\(item, t\)/)
  assert.match(client, /thirdParty\.map\(\(item\) => h\(ThirdPartyRow, \{ key: item\.id, item, t \}\)\)/)
  // 绝不把 token 折成积分、积分折成美元：文案只按 unit 选目录键。
  assert.match(client, /item\.unit === 'token' \? t\('ofm\.token'\) : t\('ofm\.credits'\)/)
  assert.doesNotMatch(client, /ofmLabel[\s\S]{0,400}\/\s*\d+\s*\*\s*t\('ofm/)
})

/**
 * 读取器只跟宿主的 Connection 打交道，所以用一个假 connection 把信封钉死：
 * pack.js 的网关按这四个字段逐个拒收，改错一个这里就会红。
 */
function fakeConnection(onFetch) {
  const seen = []
  const connection = {
    createPeer: (options) => ({ options, dispose() {} }),
    createSharedFetchHandler: (channel) => {
      assert.equal(channel, '/api')
      return {
        fetch: async (request, peer) => {
          // body 只能读一次，读完连同 peer 一起存下来给断言用。
          const body = JSON.parse(await request.text())
          seen.push({ request, peer, body })
          return onFetch(request, peer, body)
        },
      }
    },
  }
  return { seen, get: (key) => (key === 'connection' ? connection : null) }
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

test('请求信封与 pack.js 的校验逐字段对齐', async () => {
  const stub = fakeConnection((_request, _peer, body) => json({
    type: 'server-response',
    rpcId: body.rpcId,
    result: {
      ok: true,
      value: {
        provider: body.payload.payload.provider,
        accounts: body.payload.payload.provider === 'lobsterai'
          ? [{ accountId: 'a', balance: { total: 42 } }]
          : [],
      },
    },
  }))
  const reader = createOfmCredits({ get: stub.get })
  const rows = await reader.readAll()

  // 只有 lobsterai 配了账号，其余九个是空 accounts → 落成 null 被滤掉。
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, 'ofm-lobsterai')
  assert.equal(rows[0].amount, 42)

  const { request, peer, body } = stub.seen[0]
  assert.equal(request.method, 'POST')
  assert.equal(new URL(request.url).pathname, '/api/channel-pack')
  assert.equal(request.headers.get('content-type'), 'application/json')
  assert.equal(peer.options.principal.kind, 'owner', 'owner 之外的 principal 会被网关回 403')

  assert.equal(stub.seen.length, 10, '十个渠道各打一次')
  assert.equal(new Set(stub.seen.map((entry) => entry.body.rpcId)).size, 10, 'rpcId 不能撞')
  assert.equal(body.type, 'client-request')
  assert.equal(body.method, 'channel-pack')
  assert.equal(typeof body.rpcId, 'string')
  assert.deepEqual(body.payload, {
    method: 'usage.badge',
    payload: { provider: 'lobsterai', force: false },
  })
})

test('插件没装时网关回 404，区块安静地留空', async () => {
  const stub = fakeConnection(() => new Response('not found', { status: 404 }))
  const reader = createOfmCredits({ get: stub.get })
  assert.deepEqual(await reader.readAll(), [])
})

test('单个渠道报错不会拖垮整批，只是这一行缺席', async () => {
  const stub = fakeConnection((_request, _peer, body) => {
    if (body.payload.payload.provider === 'trae') {
      return json({ type: 'server-response', rpcId: body.rpcId, result: { ok: false, error: { code: 'bad-request', message: 'provider不能为空' } } })
    }
    return json({
      type: 'server-response',
      rpcId: body.rpcId,
      result: { ok: true, value: { provider: body.payload.payload.provider, accounts: [{ balance: { total: 1 } }] } },
    })
  })
  const reader = createOfmCredits({ get: stub.get })
  const rows = await reader.readAll()
  assert.equal(rows.some((row) => row.id === 'ofm-trae'), false)
  assert.equal(rows.length, 9)
})

test('拿不到 connection 时返回空数组，不抛', async () => {
  const reader = createOfmCredits({ get: () => null })
  assert.deepEqual(await reader.readAll(), [])
  const missing = createOfmCredits({})
  assert.deepEqual(await missing.readAll(), [])
})
