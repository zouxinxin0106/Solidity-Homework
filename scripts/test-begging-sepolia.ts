/**
 * Sepolia 测试脚本 — 测试已部署的 BeggingContract
 *
 * 使用方法：
 *   npx hardhat run scripts/test-begging-sepolia.ts --network sepolia
 */

import { network } from "hardhat";

async function main() {
  // 连接 Sepolia 网络，返回 ethers 工具对象
  const { ethers } = await network.create();

  // ======================== 配置区 ========================

  // 已部署的 BeggingContract 地址
  const CONTRACT_ADDRESS = "0x1c73069794b0B93b84a5e3C8eC50dA817C2D320c";

  // 想要查询的捐赠者地址（替换成你的 MetaMask 地址，或保持默认查 deployer）
  const TARGET_ADDRESS = "0xf38c0f682e1c84124918bd5b2ddb050695c6d941";

  // ======================== 开始测试 ========================

  console.log("\n========== BeggingContract Sepolia 测试 ==========\n");

  // 获取合约实例（attach 到已部署的地址）
  const contract = await ethers.getContractAt("BeggingContract", CONTRACT_ADDRESS);
  console.log("✅ 已连接到合约：", CONTRACT_ADDRESS);

  // 获取当前网络的签名者（在 Sepolia 上只有一个 — 即 keystore 里配置的私钥对应的账户）
  const [deployer] = await ethers.getSigners();
  console.log("🔑 当前签名者（owner）：", deployer.address);

  // ---------- 1. 查询合约基本信息 ----------
  console.log("\n--- 1. 合约基本信息 ---");

  const owner = await contract.owner();
  console.log("  owner：", owner);

  const deadline = await contract.donateDeadline();
  const deadlineDate = new Date(Number(deadline) * 1000);
  console.log("  donateDeadline：", deadline.toString(), "（", deadlineDate.toLocaleString(), "）");

  const contractBalance = await ethers.provider.getBalance(CONTRACT_ADDRESS);
  console.log("  合约余额：", ethers.formatEther(contractBalance), "ETH");

  // 判断捐赠窗口是否已关闭
  const now = Math.floor(Date.now() / 1000);
  if (now > Number(deadline)) {
    console.log("  ⚠️  捐赠窗口已关闭（deadline 已过）");
  } else {
    const daysLeft = Math.floor((Number(deadline) - now) / 86400);
    console.log("  ✅ 捐赠窗口开放中，剩余约", daysLeft, "天");
  }

  // ---------- 2. 测试 getDonation() ----------
  console.log("\n--- 2. 测试 getDonation() ---");

  const donation = await contract.getDonation(TARGET_ADDRESS);
  console.log("  地址", TARGET_ADDRESS);
  console.log("  捐赠金额：", ethers.formatEther(donation), "ETH");

  // 如果查的是 deployer 自己，顺便看 deployer 的 ETH 余额
  if (TARGET_ADDRESS.toLowerCase() === deployer.address.toLowerCase()) {
    const deployerEthBalance = await ethers.provider.getBalance(deployer.address);
    console.log("  deployer ETH 余额：", ethers.formatEther(deployerEthBalance), "ETH");
  }

  // ---------- 3. 测试 withdraw() ----------
  console.log("\n--- 3. 测试 withdraw() ---");

  if (contractBalance === 0n) {
    console.log("  ⏭️  合约余额为 0，跳过 withdraw 测试");
  } else {
    console.log("  合约当前余额：", ethers.formatEther(contractBalance), "ETH");

    // 记录提款前的 deployer 余额
    const balanceBefore = await ethers.provider.getBalance(deployer.address);
    console.log("  提款前 deployer 余额：", ethers.formatEther(balanceBefore), "ETH");

    try {
      // 因为是 Sepolia 真实网络，这需要消耗真实的 Gas（Sepolia ETH）
      const tx = await contract.connect(deployer).withdraw();
      console.log("  ⏳ withdraw 交易已发送，等待确认...");
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      const balanceAfter = await ethers.provider.getBalance(deployer.address);
      console.log("  ✅ withdraw 成功！");
      console.log("  Gas 消耗：", ethers.formatEther(gasCost), "ETH");
      console.log("  提款后 deployer 余额：", ethers.formatEther(balanceAfter), "ETH");
      console.log("  净到账（扣除 Gas）：", ethers.formatEther(balanceAfter - balanceBefore + gasCost), "ETH");
    } catch (error) {
      console.log("  ❌ withdraw 失败：", error.message);
    }
  }

  // ---------- 4. 查看 Top 3 排行榜 ----------
  console.log("\n--- 4. 排行榜 ---");

  const top3 = await contract.getTop3Donors();
  for (let i = 0; i < 3; i++) {
    const addr = top3[i];
    // 空地址表示该排名还没有人
    if (addr === "0x0000000000000000000000000000000000000000") {
      console.log(`  第 ${i + 1} 名：空（暂无捐赠者）`);
    } else {
      const amt = await contract.getDonation(addr);
      console.log(`  第 ${i + 1} 名：${addr}（${ethers.formatEther(amt)} ETH）`);
    }
  }

  // ---------- 结束 ----------
  console.log("\n========== 测试完成 ==========\n");
}

main().catch((error) => {
  console.error("脚本执行失败：", error);
  process.exitCode = 1;
});
