# LibreChat 本地开发镜像部署指南

假设你已经**拿到含有前端、后端全部代码的项目文件夹**，以下指南适用于新机器本地首次部署，确保能构建自己的 Docker 镜像并运行服务，适合二次开发和测试**所有自定义代码**。

必须使用新版 docker compose 命令, 而非 docker-compose 命令, 否则有些写法报错 
---

## 1. 先决条件

- 安装 [Docker](https://docs.docker.com/get-docker/)
- 安装 [Docker Compose](https://docs.docker.com/compose/install/)

建议版本：Docker >= 20.10，Docker Compose >= 2.0

---

## 2. 克隆/获取你的项目代码

假设已在本地获得（如通过 Git 或打包发给别人），cd 到项目根目录：
```bash
cd /path/to/your/librechat-project
```

---

## 3. 配置 docker-compose 文件（仅首次）

如果不是默认就是源码镜像（比如 docker-compose.yml 里写的是预构建镜像），
**需要确保使用本地 Dockerfile 构建**，通常方法：

1. 编辑或新建 `docker-compose.override.yml`，内容类似：

    ```yaml
    services:
      api:
        build:
          context: .
          dockerfile: Dockerfile  # 也可以用 Dockerfile.multi 不过好像有bug
        image: 'crpi-3qv8qlhd6grgh1k4.cn-hangzhou.personal.cr.aliyuncs.com/xuqesj09/librechat:latest'
        ports:
          - '${PORT}:${PORT}'
        volumes:
          - type: bind
            source: ./librechat.yaml
            target: /app/librechat.yaml
    ```

   （如有其它自定义服务、前端同理，照此添加）

docker-compose里的环境变量, 例如 `${PORT}` 会自动从 当前目录下的 `.env` 中寻找

### 重要说明：build 配置的工作机制

**api 容器配了 `build` 这个属性，只表示需要 build 的时候按照提供的信息 build，并不是每次都 build！**

#### 每次 `docker compose up` 决策流程：
1. 先看本地有没有对应的镜像（`librechat:latest`）
2. 没有就根据镜像的名字去拉（这里配置的是阿里云镜像仓库）
3. 没拉到就根据 `build` 配置的信息触发 build
4. 下次再 `up` 的时候本地有镜像就直接用了
5. `docker compose up --build` 就是**强制触发 build 覆盖本地镜像**，一般改了代码才用这个

---

## 4. 创建/编辑配置文件

参考官方文档（如需环境变量、数据库地址等），一般如 `.env` 或 `librechat.yaml` 放在项目根目录。

注意: 新增了一个快速归档的模式, 用于快速归档不用的对话
```bash
QUICK_ARCHIVE_CONVERSATIONS=true
```

---

## 5. 构建与启动服务

### 使用方式：

- **首次使用或生产环境部署（从阿里云拉取镜像）**：
    ```bash
    sudo docker compose up -d
    ```
    直接从阿里云拉取 latest 镜像

- **本地开发（构建本地镜像）**：
    ```bash
    sudo docker compose up --build -d
    ```
    本地构建并标记为阿里云镜像名，适用于代码有修改的情况

- **只构建不启动**：
    ```bash
    sudo docker compose build --no-cache
    ```
    或指定服务名：
    ```bash
    sudo docker compose build --no-cache api
    ```

启动后访问：http://localhost:3080

---

## 6. 常见运维命令

- 查看运行容器：
    ```bash
    sudo docker ps
    ```
- 查看日志：
    ```bash
    sudo docker compose logs -f
    ```
    或查看指定服务：
    ```bash
    sudo docker compose logs -f api
    ```
- 重启（如重建后）：
    ```bash
    sudo docker compose down
    sudo docker compose up -d
    ```
- 停止：
    ```bash
    sudo docker compose down
    ```

---

## 7. 升级/修改代码后如何热更新

**每次修改代码后一定要重新构建、重启容器才能生效！**

```bash
sudo docker compose down
sudo docker compose up --build -d
```

或者分步执行：
```bash
sudo docker compose down
sudo docker compose build --no-cache
sudo docker compose up -d
```

---

## 8. 推送镜像到阿里云（维护者使用）

### 步骤一：登录阿里云镜像仓库
```bash
docker login --username=18576424804 crpi-3qv8qlhd6grgh1k4.cn-hangzhou.personal.cr.aliyuncs.com
```

### 步骤二：创建 buildx 构建器（首次需要）
```bash
docker buildx create --name mybuilder --use --driver docker-container
docker buildx inspect --bootstrap
```

### 步骤三：构建多架构镜像并推送
如果出bug就把 `Dockerfile.multi` 换成 `Dockerfile`

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t crpi-3qv8qlhd6grgh1k4.cn-hangzhou.personal.cr.aliyuncs.com/xuqesj09/librechat:latest \
  -t crpi-3qv8qlhd6grgh1k4.cn-hangzhou.personal.cr.aliyuncs.com/xuqesj09/librechat:v0.8.1 \
  -f Dockerfile.multi \
  --push \
  .
```

**说明**：
- `--platform linux/amd64,linux/arm64`：同时构建 amd64 和 arm64 两种架构
- `-t` 可以指定多个标签（如 latest 和版本号）
- `--push`：构建完成后直接推送到远程仓库
- 最后的 `.` 表示构建上下文为当前目录

---

## 9. 其他说明

- 登录端口可以在 `docker-compose.yml` 里的 `ports` 字段自定义
- 默认启用本地数据库，如需远程或自定义，请同步改好 `.env` 配置
- 本镜像包含你当前所有的代码改动（包括前端、后端、data-provider等），不是官方预构建！
- **阿里云镜像仓库**配置在 `docker-compose.override.yml` 中的 `image` 字段，用于团队共享或多环境部署

---

## 10. 常见问题

- **改了代码没生效**
    - 必须使用 `docker compose up --build` 或完整 `docker compose build --no-cache` 再 `up`
    - 检查是否使用了缓存的旧镜像
  
- **端口冲突**
    - 检查 3080 端口未被占用，或在 compose 文件中修改映射端口
  
- **UID/GID 警告**
    - 如需设定（文件映射/权限），可在 `.env` 或 compose 文件中设置

- **镜像拉取失败**
    - 检查阿里云镜像仓库地址和认证信息是否正确
    - 确认网络能访问阿里云镜像服务
    - 如无法访问远程仓库，可删除 `image` 字段，强制使用本地构建

- **多架构构建失败**
    - 确保已安装并启用 Docker buildx
    - 检查 QEMU 是否正确安装（用于跨平台构建）

---

## 11. 开发与生产环境建议

### 开发环境
- 使用 `docker compose up --build` 确保代码变更生效
- 可以注释掉 `image` 字段，只保留 `build`，避免与远程镜像混淆

### 生产环境
- 使用 `docker compose up -d` 从阿里云拉取稳定的 latest 镜像
- 定期更新镜像：`docker compose pull && docker compose up -d`

---

# 结论

本流程涵盖**本地源码构建、远程镜像拉取与 Docker 运行**，适合二次开发和自定义代码环境。

**关键要点**：
- `docker compose up` - 优先使用本地镜像或拉取远程镜像
- `docker compose up --build` - 强制重新构建（代码修改后必须）
- `docker compose build` - 只构建不启动
- 推送镜像需要使用 `docker buildx` 支持多架构构建

切记每次代码有更改都需要**重新 build 并 up**，不起效时优先检查 build 步骤和 volume 映射。