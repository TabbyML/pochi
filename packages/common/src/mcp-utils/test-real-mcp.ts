// #!/usr/bin/env node

// import { getLogger } from "../base";
// import { pochiConfig } from "../configuration/config-manager";
// import { McpHub } from "./mcp-hub";

// const logger = getLogger("RealMCPTest");

// async function testRealMcpConnections() {
//   console.log("=== 测试真实MCP服务器连接 ===");

//   try {
//     // 获取当前配置中的MCP服务器
//     const config = pochiConfig.value;
//     const mcpServers = config.mcp || {};

//     console.log("发现的MCP服务器配置:", Object.keys(mcpServers));

//     if (Object.keys(mcpServers).length === 0) {
//       console.log("未找到MCP服务器配置，创建示例配置进行测试...");

//       // 创建一个简单的echo服务器测试
//       const testConfig = {
//         "echo-test": {
//           command: "echo",
//           args: ["Hello from MCP test"],
//           disabled: false,
//           disabledTools: [],
//         },
//       };

//       await testMcpConfig(testConfig);
//     } else {
//       console.log("使用现有配置测试MCP连接...");
//       await testMcpConfig(mcpServers);
//     }
//   } catch (error) {
//     console.error("测试失败:", error);
//   }
// }

// async function testMcpConfig(mcpConfig: any) {
//   console.log("\n开始测试MCP配置:", Object.keys(mcpConfig));

//   const mcpHub = new McpHub({
//     config: mcpConfig,
//     clientName: "pochi-real-test",
//     onStatusChange: (status) => {
//       console.log("\n--- MCP状态更新 ---");
//       console.log("连接状态:");

//       for (const [name, connection] of Object.entries(status.connections)) {
//         console.log(`  ${name}: ${connection.status}`);
//         if (connection.error) {
//           console.log(`    错误: ${connection.error}`);
//         }
//         if (connection.tools && Object.keys(connection.tools).length > 0) {
//           console.log(`    工具: ${Object.keys(connection.tools).join(", ")}`);
//         }
//       }

//       console.log(`可用工具总数: ${Object.keys(status.toolset).length}`);
//       if (Object.keys(status.toolset).length > 0) {
//         console.log("可用工具:", Object.keys(status.toolset));
//       }
//       console.log("--- 状态更新结束 ---\n");
//     },
//   });

//   // 等待连接建立
//   console.log("等待连接建立 (5秒)...");
//   await new Promise((resolve) => setTimeout(resolve, 5000));

//   // 获取最终状态
//   const finalStatus = mcpHub.getStatus();
//   console.log("\n=== 最终测试结果 ===");
//   console.log("总连接数:", Object.keys(finalStatus.connections).length);
//   console.log(
//     "成功连接数:",
//     Object.values(finalStatus.connections).filter((c) => c.status === "ready")
//       .length,
//   );
//   console.log(
//     "失败连接数:",
//     Object.values(finalStatus.connections).filter((c) => c.status === "error")
//       .length,
//   );
//   console.log("可用工具数:", Object.keys(finalStatus.toolset).length);

//   // 详细连接信息
//   console.log("\n详细连接信息:");
//   for (const [name, connection] of Object.entries(finalStatus.connections)) {
//     console.log(`\n服务器: ${name}`);
//     console.log(`  状态: ${connection.status}`);
//     if (connection.error) {
//       console.log(`  错误: ${connection.error}`);
//     }
//     if (connection.tools) {
//       const enabledTools = Object.entries(connection.tools)
//         .filter(([, tool]) => !tool.disabled)
//         .map(([name]) => name);
//       console.log(
//         `  可用工具 (${enabledTools.length}): ${enabledTools.join(", ")}`,
//       );
//     }
//   }

//   // 测试服务器控制功能
//   console.log("\n=== 测试服务器控制功能 ===");
//   const serverNames = Object.keys(mcpConfig);

//   if (serverNames.length > 0) {
//     const testServer = serverNames[0];
//     console.log(`测试服务器: ${testServer}`);

//     // 停止服务器
//     console.log("停止服务器...");
//     mcpHub.stop(testServer);
//     await new Promise((resolve) => setTimeout(resolve, 1000));

//     // 重启服务器
//     console.log("重启服务器...");
//     mcpHub.restart(testServer);
//     await new Promise((resolve) => setTimeout(resolve, 2000));

//     // 检查重启后状态
//     const restartStatus = mcpHub.getStatus();
//     const serverStatus = restartStatus.connections[testServer];
//     console.log(`重启后状态: ${serverStatus?.status || "未知"}`);
//   }

//   // 清理
//   mcpHub.dispose();
//   console.log("\n测试完成，资源已清理");
// }

// // 主函数
// async function main() {
//   await testRealMcpConnections();
// }

// // 如果直接运行此脚本
// if (import.meta.url === `file://${process.argv[1]}`) {
//   main().catch((error) => {
//     console.error("测试脚本执行失败:", error);
//     process.exit(1);
//   });
// }

// export { testRealMcpConnections };
