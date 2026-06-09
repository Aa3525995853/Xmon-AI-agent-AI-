/**
 * 知识存储管理器
 */

const path = require('path');
const fs = require('fs');
const { dataPath, ensureDir } = require('../../config/runtimePaths');

const DATA_DIR = dataPath('knowledge');
const GRAPH_FILE = path.join(DATA_DIR, 'knowledge_graph.json');
const HABITS_FILE = path.join(DATA_DIR, 'habits.json');
const PROFILE_FILE = path.join(DATA_DIR, 'profile.json');

class Storage {
    constructor() {
        this.dataDir = DATA_DIR;
        this.files = {
            graph: GRAPH_FILE,
            habits: HABITS_FILE,
            profile: PROFILE_FILE
        };
    }

    /**
     * 加载知识
     */
    load(knowledge) {
        // 确保目录存在
        ensureDir(this.dataDir);

        // 初始化图谱结构
        if (!knowledge.graph) {
            knowledge.graph = {
                nodes: new Map(),
                edges: []
            };
        }

        // 加载知识图谱
        try {
            if (fs.existsSync(this.files.graph)) {
                const data = JSON.parse(fs.readFileSync(this.files.graph, 'utf-8'));
                if (data.nodes) {
                    knowledge.graph.nodes = new Map(Object.entries(data.nodes));
                }
                if (data.edges) {
                    knowledge.graph.edges = data.edges;
                }
            }
        } catch (e) {}

        // 加载习惯
        try {
            if (fs.existsSync(this.files.habits)) {
                const data = JSON.parse(fs.readFileSync(this.files.habits, 'utf-8'));
                if (data.proceduralMemory) {
                    knowledge.proceduralMemory = new Map(Object.entries(data.proceduralMemory));
                }
            }
        } catch (e) {}

        // 加载用户画像
        try {
            if (fs.existsSync(this.files.profile)) {
                const data = JSON.parse(fs.readFileSync(this.files.profile, 'utf-8'));
                Object.assign(knowledge.userProfile || {}, data);
            }
        } catch (e) {}
    }

    /**
     * 保存知识
     */
    save(knowledge) {
        try {
            // 保存知识图谱
            const graphData = {
                nodes: Object.fromEntries(knowledge.graph?.nodes || new Map()),
                edges: knowledge.graph?.edges || []
            };
            fs.writeFileSync(this.files.graph, JSON.stringify(graphData, null, 2));

            // 保存习惯
            const habitsData = {
                proceduralMemory: Object.fromEntries(knowledge.proceduralMemory || new Map()),
                semanticMemory: Object.fromEntries(knowledge.semanticMemory?.memories || new Map())
            };
            fs.writeFileSync(this.files.habits, JSON.stringify(habitsData, null, 2));

            // 保存用户画像
            fs.writeFileSync(this.files.profile, JSON.stringify(knowledge.userProfile || {}, null, 2));
        } catch (e) {
            console.error('[Storage] 保存失败:', e.message);
        }
    }
}

module.exports = new Storage();
