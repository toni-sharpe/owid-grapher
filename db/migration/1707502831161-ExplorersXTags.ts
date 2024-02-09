import { MigrationInterface, QueryRunner } from "typeorm"

export class ExplorersXTags1707502831161 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        queryRunner.query(`
            CREATE TABLE explorers_x_tags (
                id INT AUTO_INCREMENT PRIMARY KEY,
                explorerSlug VARCHAR(150) NOT NULL,
                tagId INT NOT NULL,
                UNIQUE KEY (explorerSlug, tagId),
                FOREIGN KEY (explorerSlug) REFERENCES explorers(slug),
                FOREIGN KEY (tagId) REFERENCES tags(id)
            );
        
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        queryRunner.query(`
            DROP TABLE IF EXISTS explorers_x_tags;
        `)
    }
}
