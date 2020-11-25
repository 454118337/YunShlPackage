# 云上自动打包发布工具

### 安装

可以使用 npm 或 yarn 的方式进行安装

```
$ npm install ys-package -g
```

或

```
$ yarn add ys-package -g
```

如果你是将项目签至本地时，可以使用 `npm link` 将项目挂载到全局变量中

```
$ cd ys-package
$ npm link
```

如果你想取消挂载，可以使用 `npm unlink`

```
$ cd ys-package
$ npm unlink
```

### 使用

在任意目录下使用 `cmd` 执行 `ys-package`

```
$ ys-package
```

### 配置 Config

项目提供 `config` 配置，初次使用时程序会提醒你配置。

程序将为你在 `shell` 或 `cmd` 命令执行的目录创建 `package.config.js` 文件，请确认好在固定目录下进行命令执行，否则将会需要配置多个 `package.config.js` 文件

如果你不选择配置 `package.config.js` 时，将会读取程序目录下的 `package.config.js` 。你可以前往程序目录进行修改。

#### 配置格式

```
module.exports = {
	// 项目名称
    "YunShl": {
    	// 测试环境
        "test": {
        	// 要执行的打包命令
            "command": `npm run test`,
            // winscp 的账号密码 格式为：root:xxxxx@xxxxx
            "winscpConf": `*****请配置winscp帐号密码（root:xxxxx@xxxxx）*****`,
        },
        // 生产环境
        "production": {
            "command": `npm run build`,
            "winscpConf": `*****请配置winscp帐号密码（root:xxxxx@xxxxx）*****`,
        },
        // 主干
        "trunk": {
        	// 项目路径
            "projectPath": `D:\\workSpace\\YunShl\\trunk`,
        },
        // 分支
        "branches": {
            "projectPath": `D:\\workSpace\\YunShl\\branches`,
        },
    },
};

```

#### 文件目录约定

##### 主干

项目会通过 `config` 文件配置的 `项目路径` 中查找该文件下的文件作为 **项目选项**

```
// 示例
├── trunk
|   ├── YunShlAccount

```

##### 分支

项目会通过 `config` 文件配置的 `项目路径` 中查找该文件下的文件作为 **版本选项** ，通过选择 **版本选项** 文件查找该目录下文件作为 **项目选项**

```
// 示例
├── branches
|   ├── vx.x.x
|   |   ├── YunShlAccount
```

> PS：文件名自定



### 注意事项

打包发布上传服务器的文件名是从 `package.json` 的 `name` 获取的，请注意配置 `package.json`