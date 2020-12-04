#!/usr/bin/env node
const inquirer = require('inquirer');
const path = require('path');
const fs = require('fs');
const process = require('process');
const shell = require('shelljs');
const colors = require('colors');
const {COPYFILE_EXCL} = fs.constants;
/*
*  自动打包上传
*  1.设置 config 文件，记录项目路径
*  2.根据 config 文件记录的路劲找到对应的文件夹信息
*  3.进行命令行交互
*    1.发布测试或者正式
*    2.是否要发布多个
*    3.发布单个时要发布哪个项目
*  4.进入要发布的区域
*  5.svn update
*    svn update 异常时抛出异常，退出进程，不管是否是选择多个发布
*  6.执行相应的发布命令
* */

// 当前进程目录下找 package.config.js
async function isCreationInquirer() {
    const anwsers = await inquirer.prompt([{
        type: 'confirm',
        name: 'isCreation',
        message: '是否在当前目录下创建 package.config.js',
        default: true,
    }]);
    const {isCreation} = anwsers;
    if (!isCreation) {
        const conf = require(path.join(__dirname, './../package.config.js'));
        inquirerFn(conf);
        return
    }
    try {
        // 将 package.config.js 拷贝到当前进程目录下
        fs.copyFileSync(
            path.join(__dirname, './../package.config.js'),
            path.join(process.cwd(), 'package.config.js'),
            COPYFILE_EXCL
        );
    } catch (e) {
        throw e;
    }
    console.log('请完成配置后重试！')
}

// 判断 config 文件是否存在
if (!fs.existsSync(path.join(process.cwd(), 'package.config.js'))) {
    console.warn('当前目录下未找到 package.config.js');
    // 未找到时询问是否创建 config
    isCreationInquirer();
} else {
    const conf = require(path.join(process.cwd(), 'package.config.js'));
    inquirerFn(conf);
}

// 判定 npm 命令是否可执行
if (!shell.which('npm')) {
    //在控制台输出内容
    shell.echo('环境变量未配置 npm 或未安装npm，请确认后重试');
    shell.exit(1);
}
// 判定 winscp 命令是否可执行
if (!shell.which('winscp')) {
    //在控制台输出内容
    shell.echo('环境变量未配置 winscp 或未安装winscp，请确认后重试');
    shell.exit(1);
}

// svn 更新存在冲突
function conflicts(stdout) {
    let arr = JSON.stringify(stdout)
        .split(`\\r\\n`);
    arr = arr.slice(1, arr.length - 4);
    let conflictingFiles = arr.map(item => {
        item = item.replace(/\\\\/g, '\\');
        item = item.replace(/\s/g, '');
        item = item.substring(1);
        return item
    });
    const conflictingFilesText = conflictingFiles.join('\r\n');
    console.log(`更新完成，以下文件发生冲突，请修改后再试
          ${conflictingFilesText}
        `.red);
    shell.exit(1);
}

// 存在未处理冲突
function nodeRemainsInConflict(stdout) {
    let arr = JSON.stringify(stdout)
        .split(`\\r\\n`);
    arr = arr.slice(1, arr.length - 4);
    let conflictingFiles = arr.map(item => {
        item = item.replace(/\\\\/g, '\\');
        item = item.replace(/\s/g, '');
        item = item.replace('Skipped', '');
        item = item.replace('--Noderemainsinconflict', '');
        item = item.replace(/'/g, '');
        return item
    });
    const conflictingFilesText = conflictingFiles.join('\r\n');
    console.log(`更新完成，以下文件存在冲突，请修改后再试
          ${conflictingFilesText}
        `.red);
    shell.exit(1);
}

// 打包发布函数
/*
* @params option
*   @params path 项目路径
*   @params command 打包命令
*   @params winscpConf winscp上传命令
*   @params projectName 项目名称
*   @params drive 盘符
* */
function shellCommand(option) {
    const {path, command, winscpConf, projectName, drive, onlyPackage, targetDir} = option;
    return new Promise(((resolve, reject) => {
        console.log(`正在打包上传 ${projectName}...`.bgGreen);
        // 进入该盘
        // 做这步的原因是，无论是从哪个位置进入的 cmd ，都可以找到对应项目的位置
        shell.cd(`${drive}:`);
        //进入项目目录
        shell.cd(path);
        // svn 更新文件
        console.log(`开始更新代码...`.green);
        const svnUpdate = shell.exec(`svn update`, {silent: true});
        // 发生冲突
        if (svnUpdate.stdout.includes('Text conflicts')) {
            conflicts(svnUpdate.stdout)
        }
        // 存在未处理冲突
        if (svnUpdate.stdout.includes('Node remains in conflict')) {
            nodeRemainsInConflict(svnUpdate.stdout)
        }
        console.log(`更新代码完成...`.green);
        console.log(`开始打包...`.green);
        // 删除打包文件
        shell.rm('-rf', 'dist/');
        shell.rm('-rf', 'distProject/');
        // webpack 打包
        const webpackShell = shell.exec(command, {silent: true});
        // 编译失败
        if (
            webpackShell.stdout.includes('Failed to compile.') ||
            webpackShell.stdout.includes('[failed]') ||
            webpackShell.stderr.includes('ERR')
        ) {
            shell.echo(`编译出错，请检查后再试！`);
            console.log((webpackShell.stderr ? webpackShell.stderr : webpackShell.stdout).red);
            shell.exit(1);
        }
        // 编译成功
        if (
            webpackShell.stdout.includes('Compiled successfully.') ||
            webpackShell.stdout.includes('File sizes after gzip:') ||
            !webpackShell.stdout.includes('[failed]')
        ) {
            try {
                shell.mkdir('distProject');
                const copy = shell.cp('-R', 'dist/*', 'distProject/');
                if (copy.stderr.includer('no such file or directory')) {
                    console.log(copy.stderr);
                    shell.exit(1);
                }
            } catch (e) {
                console.error(e.red)
            }
        }
        console.log(`打包完成...`.green);
        if (!onlyPackage) {
            console.log(`开始上传...`.green);
            const winscpCommand = `winscp /command "open sftp://${winscpConf}""" "cd ../${targetDir}" "put distProject " "call cp -rf reactJs/${projectName} reactJs/backup" "call cp -rf distProject/* reactJs/${projectName}/" "rmdir distProject" "exit"`;
            try {
                shell.exec(winscpCommand);
            } catch (e) {
                console.log(e)
            }

        }
        resolve();
    }))
}

/*
*打包队列
* @params queue 打包列表
* @params handler 处理函数
* @params limit 同时执行最大数
* */
function limitLoad(queue, handler, limit) {
    // 对数组进行拷贝
    const sequence = [].concat(queue);
    let promises = [];

    // 实现并发请求达到最大值
    promises = sequence.splice(0, limit).map((item, index) => {
        // 这里返回的 index 是任务在数组 promises 的脚标
        // 用于在 Promise.race 后找到完成的任务脚标
        return handler(item).then(() => {
            return index
        })
    });

    // 利用数组的 reduce 方法来以队列的形式执行
    return sequence.reduce((last, item, currentIndex) => {
        return last.then(() => {
            // 返回最快改变状态的 Promise
            return Promise.race(promises)
        }).catch(err => {
            // 这里的 catch 不仅用来捕获前面 then 方法抛出的错误
            // 更重要的是防止中断整个链式调用
            console.error(err)
        }).then((res) => {
            // 用新的 Promise 替换掉最快改变状态的 Promise
            promises[res] = handler(sequence[currentIndex]).then(() => res)
        })
    }, Promise.resolve()).then(() => {
        return Promise.all(promises)
    })

}

function inquirerFn(conf) {
    inquirer.prompt([
        // 选择发布环境
        {
            type: 'list',
            message: '发布环境:',
            name: 'env',
            choices: [
                "test",
                "production",
            ],
        },
        // 选择发布项目
        {
            type: 'list',
            message: '要发布哪个项目:',
            name: 'projectName',
            choices: function () {
                return Object.keys(conf)
            },
        },
        // 选择发布版本
        {
            type: 'list',
            message: '将要发布的版本(主干或分支):',
            name: 'version',
            choices: [
                "trunk",
                "branches",
            ],
        },
        // 选择发布分支
        {
            type: 'list',
            message: '将要发布哪个项目:',
            name: 'branches',
            when: function (anwsers) {
                return anwsers.version === 'branches'
            },
            choices: function (anwsers) {
                const {projectName, version} = anwsers;
                const projectList = [];
                const list = shell.ls(conf[projectName][version].projectPath);
                list.forEach(item => {
                    projectList.push(item);
                });
                return projectList
            },
        },
        // 多选
        {
            type: 'checkbox',
            message: '请选择要发布的项目（可多选）:',
            name: 'subProject',
            choices: function (anwsers) {
                const {projectName, version, branches} = anwsers;
                const projectList = [];
                const path = `${conf[projectName][version].projectPath}${version === 'branches' ? `/${branches}` : ``}`;
                const list = shell.ls(path);
                list.forEach(item => {
                    projectList.push(item);
                });
                return projectList
            },
        },
        {
            type: 'confirm',
            message: '是否仅打包:',
            name: 'onlyPackage',
            default: false,
        },
    ])
        .then(anwsers => {
            const {env, projectName, version, subProject, branches, onlyPackage} = anwsers;
            // 获取配置
            const projectConf = conf[projectName];
            //获取项目路径
            const projectPath = projectConf[version].projectPath;
            // 获取盘符
            const drive = projectPath.split(':')[0];
            // 获取项目版本配置 主干/分支
            const versionConf = projectConf[env];
            // 打包队列
            const packageQueue = [];
            // 重组子项目列表
            // 处理项目名
            const handleName = (data) => {
                shell.cd(`${drive}:`);
                shell.cd(branches ? path.join(projectPath, branches, data) : path.join(projectPath, data));
                return shell.grep('name', 'package.json').toString().split(',')[0].split(':')[1].replace(/[^0-1A-Za-z]/g, '');
            };
            //遍历子项目数组，往队列添加属性
            subProject.forEach(item => {
                packageQueue.push({
                    path: branches ? path.join(projectPath, branches, item) : path.join(projectPath, item),
                    projectName: handleName(item),
                    drive: drive,
                    ...versionConf,
                    onlyPackage: onlyPackage,
                    targetDir: projectConf.targetDir
                })
            });
            //开始执行队列
            try {
                limitLoad(packageQueue, shellCommand, 1);
            } catch (e) {
                console.log(e)
            }
        });
}






