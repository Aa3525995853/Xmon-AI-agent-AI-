/**
 * @file 知识图谱服务
 * @description 管理用户知识的图谱结构，支持实体、关系提取和上下文检索
 * @module services/knowledge_graph
 * @version 1.0.0
 * @date 2026-06-06
 */

const fs = require('fs');
const path = require('path');

// 运行时路径配置（统一管理 data/logs/uploads）
const { dataPath, ensureDir } = require('../config/runtimePaths');

/** 知识图谱数据文件路径 */
const GRAPH_FILE = dataPath('knowledge_graph.json');

class KnowledgeGraph {
    constructor() {
        this.graph = this.load();
    }

    load() {
        try {
            if (fs.existsSync(GRAPH_FILE)) {
                return JSON.parse(fs.readFileSync(GRAPH_FILE, 'utf-8'));
            }
        } catch (e) {
            console.error('[KnowledgeGraph] 加载知识图谱失败:', e.message);
        }
        return this.getDefaultData();
    }

    save() {
        try {
            const dir = path.dirname(GRAPH_FILE);
            ensureDir(dir);
            fs.writeFileSync(GRAPH_FILE, JSON.stringify(this.graph, null, 2), 'utf-8');
        } catch (e) {
            console.error('[KnowledgeGraph] 保存知识图谱失败:', e.message);
        }
    }

    getDefaultData() {
        return {
            entities: {},
            relations: [],
            stats: {
                totalEntities: 0,
                totalRelations: 0,
                lastUpdate: null,
                categories: {}
            }
        };
    }

    addEntity(name, type, properties = {}) {
        const entityId = this.normalizeId(name);

        if (this.graph.entities[entityId]) {
            const existing = this.graph.entities[entityId];
            existing.mentionCount++;
            existing.lastMentioned = Date.now();
            Object.assign(existing.properties, properties);
            this.save();
            return existing;
        }

        const entity = {
            id: entityId,
            name,
            type,
            properties,
            mentionCount: 1,
            firstMentioned: Date.now(),
            lastMentioned: Date.now(),
            relatedEntities: [],
            relatedTopics: []
        };

        this.graph.entities[entityId] = entity;
        this.graph.stats.totalEntities++;
        this.graph.stats.categories[type] = (this.graph.stats.categories[type] || 0) + 1;
        this.graph.stats.lastUpdate = Date.now();

        this.save();
        return entity;
    }

    addRelation(fromEntity, relationType, toEntity, properties = {}) {
        const fromId = this.normalizeId(fromEntity);
        const toId = this.normalizeId(toEntity);

        if (!this.graph.entities[fromId]) {
            this.addEntity(fromEntity, 'unknown');
        }
        if (!this.graph.entities[toId]) {
            this.addEntity(toEntity, 'unknown');
        }

        const existing = this.graph.relations.find(
            r => r.from === fromId && r.type === relationType && r.to === toId
        );

        if (existing) {
            existing.strength = (existing.strength || 1) + 1;
            existing.lastSeen = Date.now();
            Object.assign(existing.properties, properties);
            this.save();
            return existing;
        }

        const relation = {
            from: fromId,
            type: relationType,
            to: toId,
            strength: 1,
            properties,
            createdAt: Date.now(),
            lastSeen: Date.now()
        };

        this.graph.relations.push(relation);
        this.graph.stats.totalRelations++;
        this.graph.stats.lastUpdate = Date.now();

        if (!this.graph.entities[fromId].relatedEntities.includes(toId)) {
            this.graph.entities[fromId].relatedEntities.push(toId);
        }
        if (!this.graph.entities[toId].relatedEntities.includes(fromId)) {
            this.graph.entities[toId].relatedEntities.push(fromId);
        }

        this.save();
        return relation;
    }

    extractFromConversation(userInput, aiResponse) {
        const extracted = {
            entities: [],
            relations: []
        };

        const entityPatterns = [
            { pattern: /([\u4e00-\u9fa5]{2,4})是(我的|一个|一位)([\u4e00-\u9fa5]{2,8})/g, type: 'identity', extractName: 1, extractValue: 3, relation: 'is_a' },
            { pattern: /我喜欢(了?)([\u4e00-\u9fa5]{2,10})/g, type: 'preference', extractName: 2, relation: 'likes' },
            { pattern: /我不喜欢(了?)([\u4e00-\u9fa5]{2,10})/g, type: 'aversion', extractName: 2, relation: 'dislikes' },
            { pattern: /我在([\u4e00-\u9fa5]{2,8})(工作|上班|学习|读书)/g, type: 'location', extractName: 1, relation: 'located_at' },
            { pattern: /我的([\u4e00-\u9fa5]{2,6})叫([\u4e00-\u9fa5]{2,8})/g, type: 'possession', extractName: 1, extractValue: 2, relation: 'named' },
            { pattern: /我用([\u4e00-\u9fa5a-zA-Z0-9]{2,15})(写代码|开发|编程|做项目)/g, type: 'tool', extractName: 1, relation: 'uses_for' },
            { pattern: /我(每天|经常|总是|通常)([\u4e00-\u9fa5]{2,10})/g, type: 'habit', extractName: 2, relation: 'habitually' },
            { pattern: /我(想|要|需要)([\u4e00-\u9fa5]{2,10})/g, type: 'desire', extractName: 2, relation: 'wants' },
            { pattern: /我(正在|在)([\u4e00-\u9fa5]{2,10})/g, type: 'activity', extractName: 2, relation: 'doing' },
            { pattern: /我(的工作|职业|岗位)是([\u4e00-\u9fa5]{2,10})/g, type: 'occupation', extractName: 2, relation: 'works_as' }
        ];

        for (const { pattern, type, extractName, extractValue, relation } of entityPatterns) {
            let match;
            while ((match = pattern.exec(userInput)) !== null) {
                const name = match[extractName];
                if (!name || name.length < 2) continue;

                const entity = this.addEntity(name, type, { source: 'conversation' });
                extracted.entities.push(entity);

                const userEntity = this.addEntity('用户', 'person', { isSelf: true });

                if (extractValue) {
                    const valueEntity = this.addEntity(match[extractValue], type + '_value', { source: 'conversation' });
                    const rel = this.addRelation(name, relation, match[extractValue]);
                    extracted.relations.push(rel);
                    this.addRelation('用户', 'knows_about', name);
                } else {
                    const rel = this.addRelation('用户', relation, name);
                    extracted.relations.push(rel);
                }
            }
        }

        this.extractSemanticRelations(userInput, extracted);

        return extracted;
    }

    extractSemanticRelations(text, extracted) {
        const compoundPatterns = [
            { pattern: /([\u4e00-\u9fa5]{2,6})和([\u4e00-\u9fa5]{2,6})(一起|共同|合作)/g, relation: 'collaborates_with' },
            { pattern: /([\u4e00-\u9fa5]{2,8})导致(了?)([\u4e00-\u9fa5]{2,8})/g, relation: 'causes' },
            { pattern: /([\u4e00-\u9fa5]{2,8})因为([\u4e00-\u9fa5]{2,8})/g, relation: 'because_of' },
            { pattern: /([\u4e00-\u9fa5]{2,8})为了([\u4e00-\u9fa5]{2,8})/g, relation: 'for_purpose' },
            { pattern: /([\u4e00-\u9fa5]{2,8})属于([\u4e00-\u9fa5]{2,8})/g, relation: 'belongs_to' },
            { pattern: /([\u4e00-\u9fa5]{2,8})包含([\u4e00-\u9fa5]{2,8})/g, relation: 'contains' }
        ];

        for (const { pattern, relation } of compoundPatterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const from = match[1];
                const to = match[2] || match[3];
                if (from && to) {
                    this.addEntity(from, 'concept');
                    this.addEntity(to, 'concept');
                    const rel = this.addRelation(from, relation, to);
                    extracted.relations.push(rel);
                }
            }
        }
    }

    getEntity(name) {
        return this.graph.entities[this.normalizeId(name)] || null;
    }

    getRelated(name, depth = 1) {
        const entityId = this.normalizeId(name);
        const visited = new Set();
        const result = { entities: [], relations: [] };

        const traverse = (id, currentDepth) => {
            if (visited.has(id) || currentDepth > depth) return;
            visited.add(id);

            const entity = this.graph.entities[id];
            if (!entity) return;

            result.entities.push(entity);

            const directRelations = this.graph.relations.filter(r => r.from === id || r.to === id);
            for (const rel of directRelations) {
                result.relations.push(rel);
                const nextId = rel.from === id ? rel.to : rel.from;
                traverse(nextId, currentDepth + 1);
            }
        };

        traverse(entityId, 0);
        return result;
    }

    search(query, limit = 10) {
        const results = [];
        const queryLower = query.toLowerCase();

        for (const [id, entity] of Object.entries(this.graph.entities)) {
            let score = 0;

            if (entity.name.toLowerCase().includes(queryLower)) score += 3;
            if (entity.type.toLowerCase().includes(queryLower)) score += 1;

            for (const val of Object.values(entity.properties)) {
                if (String(val).toLowerCase().includes(queryLower)) score += 1;
            }

            if (score > 0) {
                results.push({ ...entity, score });
            }
        }

        results.sort((a, b) => b.score - a.score);
        return results.slice(0, limit);
    }

    getContextForLLM(topic = '', maxEntities = 10) {
        const parts = [];

        if (topic) {
            const related = this.search(topic, 5);
            if (related.length > 0) {
                parts.push('[相关知识]');
                related.forEach(entity => {
                    const rels = this.graph.relations
                        .filter(r => r.from === entity.id || r.to === entity.id)
                        .sort((a, b) => b.strength - a.strength)
                        .slice(0, 3);

                    rels.forEach(rel => {
                        const fromName = this.graph.entities[rel.from]?.name || rel.from;
                        const toName = this.graph.entities[rel.to]?.name || rel.to;
                        parts.push(`- ${fromName} ${rel.type} ${toName}（强度${rel.strength}）`);
                    });
                });
            }
        }

        const topEntities = Object.values(this.graph.entities)
            .sort((a, b) => b.mentionCount - a.mentionCount)
            .slice(0, maxEntities);

        if (topEntities.length > 0) {
            parts.push('[用户知识图谱]');
            topEntities.forEach(entity => {
                const rels = this.graph.relations
                    .filter(r => r.from === entity.id)
                    .sort((a, b) => b.strength - a.strength)
                    .slice(0, 2);

                if (rels.length > 0) {
                    rels.forEach(rel => {
                        const toName = this.graph.entities[rel.to]?.name || rel.to;
                        parts.push(`- ${entity.name} ${rel.type} ${toName}`);
                    });
                } else {
                    parts.push(`- ${entity.name}（${entity.type}，提及${entity.mentionCount}次）`);
                }
            });
        }

        return parts.length > 1 ? parts.join('\n') : '';
    }

    normalizeId(name) {
        return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_\u4e00-\u9fa5]/g, '');
    }

    getStats() {
        const entityTypes = {};
        const relationTypes = {};

        Object.values(this.graph.entities).forEach(e => {
            entityTypes[e.type] = (entityTypes[e.type] || 0) + 1;
        });

        this.graph.relations.forEach(r => {
            relationTypes[r.type] = (relationTypes[r.type] || 0) + 1;
        });

        return {
            totalEntities: this.graph.stats.totalEntities,
            totalRelations: this.graph.stats.totalRelations,
            entityTypes,
            relationTypes,
            topEntities: Object.values(this.graph.entities)
                .sort((a, b) => b.mentionCount - a.mentionCount)
                .slice(0, 10)
                .map(e => ({ name: e.name, type: e.type, mentions: e.mentionCount })),
            lastUpdate: this.graph.stats.lastUpdate
        };
    }
}

module.exports = new KnowledgeGraph();
