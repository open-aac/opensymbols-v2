class CreateAppUsersAndCharacters < ActiveRecord::Migration[5.0]
  def change
    create_table :app_users, id: false do |t|
      t.string :clerk_user_id, null: false
      t.datetime :created_at, null: false
      t.datetime :deleted_at
    end
    add_index :app_users, :clerk_user_id, unique: true

    create_table :characters, id: :uuid, default: nil do |t|
      t.string :clerk_user_id, null: false
      t.string :name, limit: 80, null: false
      t.string :template_key, null: false
      t.integer :template_version, null: false
      t.integer :configuration_version, null: false
      t.jsonb :identity, null: false, default: {}
      t.integer :revision, null: false, default: 1
      t.datetime :created_at, null: false
      t.datetime :updated_at, null: false
    end
    add_index :characters, [:clerk_user_id, :updated_at, :id], name: 'index_characters_on_owner_and_updated_at'
    add_foreign_key :characters, :app_users,
      column: :clerk_user_id,
      primary_key: :clerk_user_id,
      on_delete: :cascade

    create_table :character_symbols, id: :uuid, default: nil do |t|
      t.uuid :character_id, null: false
      t.string :name, limit: 80, null: false
      t.integer :configuration_version, null: false
      t.jsonb :action, null: false, default: {}
      t.integer :revision, null: false, default: 1
      t.datetime :created_at, null: false
      t.datetime :updated_at, null: false
    end
    add_index :character_symbols, [:character_id, :updated_at, :id], name: 'index_character_symbols_on_character_and_updated_at'
    add_foreign_key :character_symbols, :characters, on_delete: :restrict
  end
end
