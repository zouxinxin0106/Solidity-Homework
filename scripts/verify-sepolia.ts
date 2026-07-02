/**
 * Sepolia 验证脚本 — 对已部署的 NFT 拍卖合约做一遍完整的流程验证
 *
 * 使用方式：
 *   npx hardhat run scripts/verify-sepolia.ts --network sepolia
 *
 * 前置条件：
 *   - 合约已经部署到 Sepolia（地址见下面配置区）
 *   - 部署账户有足够的 Sepolia ETH 付 gas
 */

import { network } from "hardhat";

// ======================== 配置区 ========================
// 把下面三个地址换成你自己部署的合约地址
const MYNFT_ADDRESS = "0xe0865C646384C9Ea40199c82211343132761A333";
const AUCTION_PROXY_ADDRESS = "0x038b99C4FcD96749860EdfFe1254108a3BE83c5e";
const ETH_USD_PRICE_FEED = "0x694AA1769357215DE4FAC081bf1f309aDC325306";
// ========================================================

async function main() {
  const { ethers } = await network.create();
  const [deployer] = await ethers.getSigners();

  console.log("\n========== NFT 拍卖市场 — Sepolia 验证 ==========\n");
  console.log("当前账户：", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("账户余额：", ethers.formatEther(balance), "ETH\n");

  // ---- 连接已部署的合约 ----
  const nft = await ethers.getContractAt("MyNFT", MYNFT_ADDRESS);
  const auction = await ethers.getContractAt("NFTAuctionLogic", AUCTION_PROXY_ADDRESS);

  // ======================== 1. 验证初始化 ========================
  console.log("--- 1. 验证合约初始化 ---");
  const owner = await auction.owner();
  console.log("  拍卖合约 owner：", owner);
  console.log("  预期 owner：    ", deployer.address);
  console.log("  " + (owner === deployer.address ? "✅ 一致" : "❌ 不一致"));

  const auctionCount = await auction.auctionCount();
  console.log("  当前拍卖数量：", auctionCount.toString());

  const nftName = await nft.name();
  console.log("  MyNFT 名称：", nftName);

  // ======================== 2. 验证 Chainlink 价格预言机 ========================
  console.log("\n--- 2. 验证 Chainlink 价格预言机 ---");
  try {
    const ethPrice = await auction.getEthUsdPrice(ethers.ZeroAddress);
    const usdValue = await auction.tokenToUsd(ethers.parseEther("1"), ethers.ZeroAddress);
    console.log("  ETH/USD 价格：", (Number(ethPrice) / 1e8).toFixed(2), "$");
    console.log("  1 ETH ≈", (Number(usdValue) / 1e8).toFixed(2), "$");
    console.log("  ✅ Chainlink 预言机工作正常");
  } catch (err: unknown) {
    const e = err as Error;
    console.log("  ⚠️  预言机读取失败（可能是价格过期或未注册）");
    console.log("  ", e.message);
  }

  // ======================== 3. 铸造 NFT ========================
  console.log("\n--- 3. 铸造 NFT（给自己） ---");
  const nftOwner = await nft.owner();
  console.log("  MyNFT 的管理员：", nftOwner);

  let latestTokenId;
  let auctionId = 0n;
  if (nftOwner.toLowerCase() === deployer.address.toLowerCase()) {
    try {
      const tx = await nft.safeMint(deployer.address, "ipfs://verify-nft");
      const receipt = await tx.wait();
      if (!receipt) { console.log("  ❌ 交易回执为空"); return; }
      // 从 Transfer 事件里拿 tokenId（因为 tokenId 是 indexed，在 topics[3] 里）
      const transferTopic = ethers.id("Transfer(address,address,uint256)");
      const log = receipt.logs.find((l) => l.topics[0] === transferTopic);
      latestTokenId = log ? BigInt(log.topics[3]) : 1n;
      console.log("  ✅ 铸造成功！Token ID：", latestTokenId.toString());
    } catch (err: unknown) {
      const e = err as Error;
      console.log("  ❌ 铸造失败：", e.message);
      console.log("  ⏭️  跳过后续步骤");
      return;
    }
  } else {
    console.log("  ⚠️  当前账户不是 MyNFT 的 owner，无法铸造");
    console.log("  ⏭️  跳过后续步骤");
    return;
  }

  // ======================== 4. 创建拍卖 ========================
  console.log("\n--- 4. 创建拍卖 ---");
  try {
    const approveTx = await nft.approve(AUCTION_PROXY_ADDRESS, latestTokenId);
    await approveTx.wait();
    console.log("  ✅ 授权成功");

    const startingPrice = ethers.parseEther("0.00000001");
    const duration = 3600n; // 1 小时

    const createTx = await auction.createAuction(
      MYNFT_ADDRESS,
      latestTokenId,
      startingPrice,
      ethers.ZeroAddress,
      duration
    );
    const createReceipt = await createTx.wait();
    if (!createReceipt) { console.log("  ❌ 交易回执为空"); return; }
    const createGas = createReceipt.gasUsed * createReceipt.gasPrice;
    console.log("  ✅ 拍卖创建成功！Gas 费：", ethers.formatEther(createGas), "ETH");

    // 获取创建后的最新拍卖 ID（赋值给外层的 auctionId）
    auctionId = await auction.auctionCount();
    console.log("  拍卖 ID：", auctionId.toString());

    const info = await auction.getAuction(auctionId);
    console.log("  卖家：", info.seller);
    console.log("  起拍价：", ethers.formatEther(info.startingPrice), "ETH");
    console.log("  结束时间：", new Date(Number(info.endTime) * 1000).toLocaleString());
    console.log("  " + (info.active ? "✅ 拍卖活跃" : "❌ 拍卖未激活"));

    const nftHolder = await nft.ownerOf(latestTokenId);
    console.log("  NFT 当前持有者：", nftHolder);
    const isLocked = nftHolder.toLowerCase() === AUCTION_PROXY_ADDRESS.toLowerCase();
    console.log("  " + (isLocked ? "✅ NFT 已锁定在拍卖合约" : "❌ NFT 未转入"));
  } catch (err: unknown) {
    const e = err as Error;
    console.log("  ❌ 创建拍卖失败：", e.message);
    return;
  }

  // ======================== 5. 出价 ========================
  console.log("\n--- 5. 出价（自己给自己出价，验证用） ---");
  try {
    const bidAmount = ethers.parseEther("0.0000001");
    const bidTx = await auction.placeBid(auctionId, ethers.ZeroAddress, 0, {
      value: bidAmount,
    });
    const bidReceipt = await bidTx.wait();
    if (!bidReceipt) { console.log("  ❌ 交易回执为空"); return; }
    const bidGas = bidReceipt.gasUsed * bidReceipt.gasPrice;
    console.log("  ✅ 出价成功！Gas 费：", ethers.formatEther(bidGas), "ETH");

    const info = await auction.getAuction(auctionId);
    console.log("  最高出价：", ethers.formatEther(info.highestBid), "ETH");
    console.log("  最高出价者：", info.highestBidder);
    const bidderMatch = info.highestBidder.toLowerCase() === deployer.address.toLowerCase();
    console.log("  " + (bidderMatch ? "✅ 出价者正确" : "❌ 出价者不匹配"));
  } catch (err: unknown) {
    const e = err as Error;
    console.log("  ❌ 出价失败：", e.message);
    return;
  }

  // ======================== 6. 查询 USD 价值 ========================
  console.log("\n--- 6. 查询出价的 USD 价值 ---");
  try {
    const usdValue = await auction.getHighestBidInUSD(auctionId);
    console.log("  当前最高出价的 USD 价值：$" + (Number(usdValue) / 1e8).toFixed(2));
    console.log("  ✅ 价格查询正常");
  } catch (err: unknown) {
    const e = err as Error;
    console.log("  ⚠️  USD 价值查询失败（可能是预言机问题）：", e.message);
  }

  // ======================== 7. 验证提前结束被拒绝 ========================
  console.log("\n--- 7. 验证提前结束被拒绝 ---");
  try {
    await auction.endAuction(auctionId);
    console.log("  ⚠️  拍卖提前结束了（不应该发生）");
  } catch (err: unknown) {
    const e = err as Error;
    console.log("  ✅ 提前结束被正确拒绝：", e.message.split("(")[0].trim());
  }

  // ======================== 8. 验证升级权限 ========================
  console.log("\n--- 8. 验证升级权限 ---");
  const isOwner = owner.toLowerCase() === deployer.address.toLowerCase();
  console.log("  拍卖合约 owner：", owner);
  console.log("  当前账户：     ", deployer.address);
  console.log("  " + (isOwner
    ? "✅ 当前账户是 owner，可以升级合约"
    : "❌ 当前账户不是 owner，不能升级"));

  // ======================== 完成 ========================
  console.log("\n========== 验证完成 ==========\n");
  console.log("Etherscan 链接：");
  console.log("  MyNFT：          https://sepolia.etherscan.io/address/" + MYNFT_ADDRESS);
  console.log("  拍卖代理合约：  https://sepolia.etherscan.io/address/" + AUCTION_PROXY_ADDRESS);
  console.log("\n注意：本次验证花费了 Sepolia ETH（gas 费）");
}

main().catch((error) => {
  console.error("验证失败：", error);
  process.exitCode = 1;
});
