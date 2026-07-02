/**
 * Sepolia 部署脚本 — 部署 NFT 拍卖市场全套合约（UUPS 代理模式）
 *
 * 使用方法：
 *   1. 配置 .env 文件（参照 .env.example）
 *   2. npx hardhat run scripts/deploy-sepolia.ts --network sepolia
 *
 * 前置条件：
 *   - 账户有足够 Sepolia ETH
 *   - 已获得一个指向自己 NFT 的 MyNFT（或使用脚本铸造一个新的）
 */

import { network } from "hardhat";

// Sepolia Chainlink ETH/USD Price Feed
const ETH_USD_PRICE_FEED = "0x694AA1769357215DE4FAC081bf1f309aDC325306";

async function main() {
  // 打开一个“链上操作工具箱”（能部署合约、查余额等）
  const { ethers } = await network.create();

  // 拿第一个账户（默认部署者）
  const [deployer] = await ethers.getSigners();
  console.log("\n========== NFT 拍卖市场 — Sepolia 部署 ==========\n");
  console.log("部署账户：", deployer.address);
  console.log(
    "账户余额：",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "ETH\n"
  );

  // ======================== 1. 部署 MyNFT ========================
  console.log("--- 1/4 部署 MyNFT ---");
  const MyNFT = await ethers.getContractFactory("MyNFT");
  const nft = await MyNFT.deploy();
  await nft.waitForDeployment();
  const nftAddress = await nft.getAddress();
  console.log("  MyNFT 地址：", nftAddress);

  // ======================== 2. 部署 NFTAuctionLogic ========================
  console.log("\n--- 2/4 部署 NFTAuctionLogic（实现合约） ---");
  const NFTAuctionLogic = await ethers.getContractFactory("NFTAuctionLogic");
  const logicImpl = await NFTAuctionLogic.deploy();
  await logicImpl.waitForDeployment();
  const logicImplAddress = await logicImpl.getAddress();
  console.log("  NFTAuctionLogic 地址：", logicImplAddress);

  // ======================== 3. 部署 NFTAuctionProxy ========================
  console.log("\n--- 3/4 部署 NFTAuctionProxy（ERC1967 代理） ---");

  const initData = NFTAuctionLogic.interface.encodeFunctionData("initialize", [
    deployer.address,
    ETH_USD_PRICE_FEED,
  ]);

  const NFTAuctionProxy = await ethers.getContractFactory("NFTAuctionProxy");
  const proxy = await NFTAuctionProxy.deploy(logicImplAddress, initData);
  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();
  console.log("  NFTAuctionProxy 地址：", proxyAddress);

  // attach 的本质是：用某个合约的 ABI，去绑定一个已经存在的链上地址，从而生成一个可以调用该地址函数的 JS 代理对象
  const auction = NFTAuctionLogic.attach(proxyAddress);
  const owner = await auction.owner();
  console.log("  合约 Owner：", owner);
  console.log("  初始化 " + (owner === deployer.address ? "✅" : "❌"));

  // ======================== 部署总结 ========================
  console.log("\n========== 部署完成 ==========\n");
  console.log("合约地址汇总：");
  console.log("  MyNFT：           ", nftAddress);
  console.log("  NFTAuctionLogic： ", logicImplAddress);
  console.log("  NFTAuctionProxy： ", proxyAddress);
  console.log("  Proxy Admin：     ", deployer.address);
  console.log("\nSepolia 区块链浏览器：");
  console.log("  MyNFT：           https://sepolia.etherscan.io/address/" + nftAddress);
  console.log("  NFTAuctionLogic： https://sepolia.etherscan.io/address/" + logicImplAddress);
  console.log("  NFTAuctionProxy： https://sepolia.etherscan.io/address/" + proxyAddress);
}

main().catch((error) => {
  console.error("部署失败：", error);
  process.exitCode = 1;
});
