# NFT 拍卖市场 — 最终测试报告

**测试日期**: 2026-07-02
**框架**: Hardhat 3 + forge-std (Solidity) + Mocha/Chai (TypeScript)
**合约版本**: Solidity 0.8.28, OZ 5.6.1, Chainlink 1.5.0

---

## 一、本地测试结果

| 类型 | 通过 | 失败 | 总数 |
|------|:----:|:----:|:----:|
| Solidity 单元测试（MyNFT + NFTAuctionLogic） | 32 | 0 | 32 |
| TypeScript 集成测试（代理部署 + 拍卖流程） | 8 | 0 | 8 |
| **合计** | **40** | **0** | **40** |

---

## 二、Sepolia 测试网验证结果

**验证命令**: `npx hardhat run scripts/verify-sepolia.ts --network sepolia`
**验证账户**: `0xF38C0f682e1c84124918bd5B2Ddb050695c6D941`

### 已部署合约

| 合约 | 地址 | Etherscan |
|------|------|-----------|
| MyNFT | `0xe0865C646384C9Ea40199c82211343132761A333` | [查看](https://sepolia.etherscan.io/address/0xe0865C646384C9Ea40199c82211343132761A333) |
| NFTAuctionLogic（实现） | `0xbDA4e637E9208b77041689D15c8927cB39dF101f` | [查看](https://sepolia.etherscan.io/address/0xbDA4e637E9208b77041689D15c8927cB39dF101f) |
| NFTAuctionProxy（代理） | `0x038b99C4FcD96749860EdfFe1254108a3BE83c5e` | [查看](https://sepolia.etherscan.io/address/0x038b99C4FcD96749860EdfFe1254108a3BE83c5e) |

### 验证步骤逐项结果

| # | 验证项 | 结果 |
|:-:|--------|:----:|
| 1 | 合约 owner = 部署者（`0xF38C...6D941`） | ✅ |
| 2 | Chainlink ETH/USD 预言机读取（价格 $1639.16） | ✅ |
| 3 | NFT 铸造（Token ID 4） | ✅ |
| 4 | 创建拍卖（ID 4，起拍价 0.00000001 ETH，Gas: 0.000262 ETH） | ✅ |
| 5 | 出价（0.0000001 ETH，Gas: 0.000117 ETH） | ✅ |
| 6 | 查询出价的 USD 价值 | ✅ |
| 7 | 提前结束拍卖被正确拒绝（"has not ended yet"） | ✅ |
| 8 | 当前账户是 owner，具备升级权限 | ✅ |

---

## 三、功能覆盖检查

### 正向流程

| 功能 | 本地测试 | Sepolia 验证 |
|------|:--------:|:------------:|
| NFT 铸造（onlyOwner） | ✅ | ✅ |
| NFT 转移 | ✅ | — |
| 创建拍卖（ETH） | ✅ | ✅ |
| 出价（ETH） | ✅ | ✅ |
| 被超车自动退款 | ✅ | — |
| 结束拍卖（NFT 转移 + 资金结算） | ✅ | — |
| 合约升级（owner） | ✅ | ✅ |
| Chainlink 价格读取 | ✅ | ✅ |
| ETH 转 USD 计算 | ✅ | ✅ |

### 异常/边界覆盖

| 场景 | 结果 |
|------|:----:|
| duration=0 创建拍卖被拒绝 | ✅ |
| startingPrice=0 创建拍卖被拒绝 | ✅ |
| 非 NFT 所有者创建拍卖被拒绝 | ✅ |
| 出价低于起拍价被拒绝 | ✅ |
| 出价代币不匹配被拒绝 | ✅ |
| 拍卖结束后出价被拒绝 | ✅ |
| 未结束时提前结束被拒绝 | ✅ |
| 已结束的拍卖重复结束被拒绝 | ✅ |
| 未注册预言机读取被拒绝 | ✅ |
| 过期预言机读取被拒绝 | ✅ |
| 非 owner 升级被拒绝 | ✅ |

### 安全机制

| 机制 | 覆盖位置 |
|------|----------|
| ReentrancyGuard.nonReentrant | `placeBid`, `endAuction`, `withdrawBid` |
| UUPS `_authorizeUpgrade` + `onlyOwner` | 升级权限控制 |
| `_disableInitializers` | 防止逻辑合约被直接调用 |
| SafeERC20 | ERC20 转账安全检查 |
| Checks-Effects-Interactions | `withdrawBid` |
| ERC721Holder | 合约安全接收 NFT |

---

## 四、部署地址汇总

```
MyNFT:            0xe0865C646384C9Ea40199c82211343132761A333
NFTAuctionLogic:  0xbDA4e637E9208b77041689D15c8927cB39dF101f
NFTAuctionProxy:  0x038b99C4FcD96749860EdfFe1254108a3BE83c5e
```

> **注意**: 用户交互时请使用 **NFTAuctionProxy** 地址，不要直接调用 NFTAuctionLogic。

---

## 五、运行方式

```bash
# 本地单元测试
npx hardhat test solidity

# 本地集成测试
npx hardhat test mocha

# 全部测试
npx hardhat test

# Sepolia 部署
npx hardhat run scripts/deploy-sepolia.ts --network sepolia

# Sepolia 验证
npx hardhat run scripts/verify-sepolia.ts --network sepolia
```
