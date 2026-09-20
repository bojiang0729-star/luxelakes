# 成都豪宅板块地图网站 - 外部访问指南

## 📋 网站概述
本网站包含两个主要页面：
1. **成都豪宅板块地图.html** - 互动地图展示成都各大豪宅板块
2. **麓湖生态城.html** - 麓湖生态城详细介绍页面

## 🌐 访问方式

### 1. 局域网内访问（同一WiFi/网络）
如果你的朋友在**同一个局域网**内（如公司网络、家庭WiFi）：

**访问地址**：
```
http://192.168.3.59:8000/
```

**具体页面**：
- 网站首页（目录列表）：http://192.168.3.59:8000/
- 地图页面：http://192.168.3.59:8000/%E6%88%90%E9%83%BD%E8%B1%AA%E5%AE%85%E6%9D%BF%E5%9D%97%E5%9C%B0%E5%9B%BE.html
- 麓湖页面：http://192.168.3.59:8000/%E9%BA%93%E6%B9%96%E7%94%9F%E6%80%81%E5%9F%8E.html

> ⚠️ **注意**：文件名为中文，需要URL编码。建议访问首页后点击链接访问。

### 2. 公网访问（互联网任意位置）

#### 方案一：申请公网IP（推荐）
联系你的网络运营商（电信/联通/移动）申请**公网IP地址**。

**操作步骤**：
1. 联系客服申请公网IP
2. 在路由器中设置端口转发
   - 外部端口：8000
   - 内部IP：192.168.3.59
   - 内部端口：8000
3. 访问地址：`http://你的公网IP:8000/`

**公网IP查询**：`curl.exe -s http://checkip.amazonaws.com`
当前公网IP：**118.114.94.193**

#### 方案二：使用内网穿透服务（免费）

##### 推荐服务：
1. **ngrok** (开发者最常用)
   ```powershell
   # 下载ngrok：https://ngrok.com/download
   ngrok http 8000
   ```
   运行后会生成一个类似 `https://xxxx-xxx-xxx.ngrok-free.app` 的链接

2. **ChmlFrp** (免费高速)
   - 官网：https://www.chmlfrp.net/
   - 注册账号 → 创建隧道 → 下载客户端 → 运行

3. **NatCross** (中文界面)
   - 官网：https://www.natcross.cn/
   - 简单易用，适合新手

##### 操作步骤：
1. 注册一个内网穿透服务账号
2. 创建隧道，设置本地端口8000
3. 下载客户端并运行
4. 获取公网访问链接

#### 方案三：云服务器部署（最稳定）
将网站文件上传到云服务器（如腾讯云、阿里云），使用Nginx/Apache部署。

## 🔧 技术配置

### 当前服务器状态
- **服务器地址**：192.168.3.59 (本机内网IP)
- **服务器端口**：8000
- **防火墙**：已开放8000端口入站
- **服务器软件**：Python SimpleHTTPServer
- **运行命令**：
  ```powershell
  cd "C:\Users\Admin\CodeBuddy\Claw"
  python -m http.server 8000
  ```

### 安全注意事项
1. **仅限于临时测试**：Python SimpleHTTPServer不适合生产环境
2. **建议设置访问密码**：如果需要长期运行，建议使用带认证的Web服务器
3. **限制访问范围**：可以设置只允许特定IP访问
4. **使用HTTPS**：如果涉及敏感信息，建议使用HTTPS

## 📞 快速启动

### 启动服务器
```powershell
# 进入网站目录
cd "C:\Users\Admin\CodeBuddy\Claw"

# 启动HTTP服务器（端口8000）
python -m http.server 8000

# 后台运行（Windows）
Start-Process -NoNewWindow -FilePath "python" -ArgumentList "-m http.server 8000"
```

### 停止服务器
```powershell
# 查找Python进程
tasklist | findstr python

# 停止进程（根据需要替换PID）
taskkill /PID 20212 /F
```

## 🚀 优化建议

### 生产环境部署
如果需要长期对外提供服务：

1. **使用Nginx**：
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       
       location / {
           root /path/to/Claw;
           index index.html;
       }
   }
   ```

2. **使用Apache**：
   ```apache
   <VirtualHost *:80>
       DocumentRoot "C:/Users/Admin/CodeBuddy/Claw"
       ServerName your-domain.com
   </VirtualHost>
   ```

3. **域名配置**：
   - 购买域名（如：lukelakes.cn）
   - 设置DNS解析到公网IP
   - 配置HTTPS证书（Let's Encrypt免费）

## 📊 网站文件结构
```
C:\Users\Admin\CodeBuddy\Claw\
├── 成都豪宅板块地图.html    # 主地图页面
├── 麓湖生态城.html         # 麓湖详情页
├── hero-bg.jpg            # Hero区背景图
├── ideal-bg.jpg           # 理想兑现区背景图
├── leaflet.min.css        # 地图样式
├── leaflet.min.js         # 地图脚本
└── README.md              # 本文件
```

## ❓ 常见问题

### Q1: 为什么外部无法访问？
1. 检查防火墙是否开放8000端口
2. 检查路由器是否支持端口转发
3. 确认服务器是否在运行

### Q2: 访问速度慢？
- Python SimpleHTTPServer性能有限
- 建议使用内网穿透的国内节点
- 或部署到云服务器

### Q3: 如何设置访问密码？
使用带认证的服务器，如：
```powershell
# 使用Basic Auth
python -m http.server 8000 --username admin --password yourpass
```

### Q4: 支持手机访问吗？
✅ 支持。网站使用响应式设计，适配手机、平板和电脑。

---

**最后更新时间**：2026-04-24  
**服务器状态**：✅ 运行中（端口8000）  
**技术支持**：如有问题，请检查防火墙和路由器设置