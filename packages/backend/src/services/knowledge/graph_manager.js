/**
 * 知识图谱管理器
 */

const crypto = require('crypto');

class GraphManager {
    /**
     * 学习实体
     */
    learnEntity(entity, timestamp, graph) {
        const nodeId = entity.id || this._generateEntityId(entity);

        const node = {
            id: nodeId,
            type: entity.type || 'unknown',
            name: entity.name || entity.value,
            properties: entity.properties || {},
            strength: 1.0,
            firstSeen: timestamp,
            lastSeen: timestamp,
            accessCount: 1,
            synonyms: entity.synonyms || []
        };

        if (graph.nodes.has(nodeId)) {
            const existing = graph.nodes.get(nodeId);
            existing.strength = Math.min(1, existing.strength + 0.2);
            existing.lastSeen = timestamp;
            existing.accessCount++;
        } else {
            graph.nodes.set(nodeId, node);
        }
    }

    /**
     * 学习关系
     */
    learnRelation(relation, timestamp, graph) {
        this.learnEntity({ id: relation.from, name: relation.from, type: relation.fromType }, timestamp, graph);
        this.learnEntity({ id: relation.to, name: relation.to, type: relation.toType }, timestamp, graph);

        const edge = {
            from: relation.from,
            to: relation.to,
            type: relation.type,
            weight: relation.weight || 1.0,
            createdAt: timestamp,
            lastSeen: timestamp
        };

        const existingIdx = graph.edges.findIndex(e =>
            e.from === edge.from && e.to === edge.to && e.type === edge.type
        );

        if (existingIdx >= 0) {
            graph.edges[existingIdx].weight = Math.min(1, graph.edges[existingIdx].weight + 0.1);
            graph.edges[existingIdx].lastSeen = timestamp;
        } else {
            graph.edges.push(edge);
        }
    }

    /**
     * 生成实体ID
     */
    _generateEntityId(entity) {
        const hash = crypto.createHash('md5')
            .update(`${entity.type}_${entity.name}_${Date.now()}`)
            .digest('hex')
            .substring(0, 12);
        return `${entity.type}_${hash}`;
    }

    /**
     * 获取图谱统计
     */
    getStats(graph) {
        return {
            nodes: graph.nodes.size,
            edges: graph.edges.length,
            topEntities: Array.from(graph.nodes.values())
                .sort((a, b) => b.strength - a.strength)
                .slice(0, 10)
                .map(n => ({ id: n.id, name: n.name, strength: n.strength }))
        };
    }

    /**
     * 清除图谱
     */
    clear(graph) {
        graph.nodes.clear();
        graph.edges = [];
    }
}

module.exports = new GraphManager();