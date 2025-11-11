# LibreChat 本地开发镜像部署指南

假设你已经**拿到含有前端、后端全部代码的项目文件夹**，以下指南适用于新机器本地首次部署，确保能构建自己的 Docker 镜像并运行服务，适合二次开发和测试**所有自定义代码**。

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
          dockerfile: Dockerfile
        image: librechat:local
    ```

   （如有其它自定义服务、前端同理，照此添加）

---

## 4. 创建/编辑配置文件

参考官方文档（如需环境变量、数据库地址等），一般如 `.env` 或 `librechat.yaml` 放在项目根目录。

注意: 新增了一个快速删除的模式, 用于快速清理不用的对话
`QUICK_DELETE_CONVERSATIONS=true` 
---

## 5. 构建本地 Docker 镜像

强烈建议**每次更新代码后重建（带 `--no-cache`）**：

```bash
sudo docker-compose build --no-cache
```
（或指定服务名如 `sudo docker-compose build --no-cache api`）

---

## 6. 启动服务

```bash
sudo docker-compose up -d
```
启动后访问：http://localhost:3080

---

## 7. 常见运维命令

- 查看运行容器：
    ```bash
    sudo docker ps
    ```
- 查看日志：
    ```bash
    sudo docker-compose logs -f
    ```
- 重启（如重建后）：
    ```bash
    sudo docker-compose down
    sudo docker-compose up -d
    ```
- 停止：
    ```bash
    sudo docker-compose down
    ```

---

## 8. 升级/修改代码后如何热更新

**每次修改代码后一定要重新构建、重启容器才能生效！**

```bash
sudo docker-compose down
sudo docker-compose build --no-cache
sudo docker-compose up -d
```

---

## 9. 其他说明

- 登录端口可以在 `docker-compose.yml` 里的 `ports` 字段自定义
- 默认启用本地数据库，如需远程或自定义，请同步改好 `.env` 配置
- 本镜像包含你当前所有的代码改动（包括前端、后端、data-provider等），不是官方预构建！

---

## 10. 常见问题

- **改了代码没生效**
    - 必须完整 docker-compose build --no-cache 再 up
- **端口冲突**
    - 检查 3080 端口未被占用，或在 compose 文件中修改映射端口
- **UID/GID 警告**
    - 如需设定（文件映射/权限），可在 .env 或 compose 文件中设置

---

# 结论

本流程只涉及**本地源码构建与 Docker 运行**，适合二次开发和自定义代码环境，无需官方预构建镜像。切记每次代码有更改都需要**重新 build 并 up**，不起效时优先检查 build 步骤和 volume 映射。

