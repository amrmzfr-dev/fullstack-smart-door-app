using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmartDoor.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class MultiDoor : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Doors first: the existing controller becomes "Main Glass Door"
            // (fixed ID = Door.MainDoorId) and keeps the old door PIN; the two
            // others are reserved until their controllers are set up.
            migrationBuilder.CreateTable(
                name: "Doors",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    KeyHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    PinSalt = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    PinHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    PinUpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Doors", x => x.Id);
                });

            migrationBuilder.Sql("""
                INSERT INTO "Doors" ("Id", "Name", "CreatedAt") VALUES
                  ('00000000-0000-0000-0000-000000000001', 'Main Glass Door', now()),
                  ('00000000-0000-0000-0000-000000000002', 'Technical Office', now() + interval '1 second'),
                  ('00000000-0000-0000-0000-000000000003', 'Management Office', now() + interval '2 seconds');

                UPDATE "Doors" d
                SET "PinSalt" = s."PinSalt", "PinHash" = s."PinHash", "PinUpdatedAt" = s."PinUpdatedAt"
                FROM "DoorSettings" s
                WHERE d."Id" = '00000000-0000-0000-0000-000000000001';
                """);

            migrationBuilder.DropTable(
                name: "DoorSettings");

            migrationBuilder.DropIndex(
                name: "IX_Fingerprints_Slot",
                table: "Fingerprints");

            migrationBuilder.DropIndex(
                name: "IX_DeviceCommands_Status_CreatedAt",
                table: "DeviceCommands");

            migrationBuilder.AddColumn<Guid>(
                name: "DoorId",
                table: "Fingerprints",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000001"));

            migrationBuilder.AddColumn<Guid>(
                name: "DoorId",
                table: "DeviceCommands",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000001"));

            migrationBuilder.AddColumn<Guid>(
                name: "DoorId",
                table: "AccessEvents",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DoorName",
                table: "AccessEvents",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "MemberDoors",
                columns: table => new
                {
                    MemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    DoorId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MemberDoors", x => new { x.MemberId, x.DoorId });
                    table.ForeignKey(
                        name: "FK_MemberDoors_Doors_DoorId",
                        column: x => x.DoorId,
                        principalTable: "Doors",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_MemberDoors_Members_MemberId",
                        column: x => x.MemberId,
                        principalTable: "Members",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            // Everyone already on the list may open every door to start with;
            // the old log belongs to the main door.
            migrationBuilder.Sql("""
                INSERT INTO "MemberDoors" ("MemberId", "DoorId")
                SELECT m."Id", d."Id" FROM "Members" m CROSS JOIN "Doors" d;

                UPDATE "AccessEvents"
                SET "DoorId" = '00000000-0000-0000-0000-000000000001', "DoorName" = 'Main Glass Door'
                WHERE "DoorId" IS NULL;
                """);

            migrationBuilder.CreateIndex(
                name: "IX_Fingerprints_DoorId_Slot",
                table: "Fingerprints",
                columns: new[] { "DoorId", "Slot" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_DeviceCommands_DoorId_Status_CreatedAt",
                table: "DeviceCommands",
                columns: new[] { "DoorId", "Status", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Doors_KeyHash",
                table: "Doors",
                column: "KeyHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MemberDoors_DoorId",
                table: "MemberDoors",
                column: "DoorId");

            migrationBuilder.AddForeignKey(
                name: "FK_DeviceCommands_Doors_DoorId",
                table: "DeviceCommands",
                column: "DoorId",
                principalTable: "Doors",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_Fingerprints_Doors_DoorId",
                table: "Fingerprints",
                column: "DoorId",
                principalTable: "Doors",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_DeviceCommands_Doors_DoorId",
                table: "DeviceCommands");

            migrationBuilder.DropForeignKey(
                name: "FK_Fingerprints_Doors_DoorId",
                table: "Fingerprints");

            migrationBuilder.DropTable(
                name: "MemberDoors");

            migrationBuilder.DropTable(
                name: "Doors");

            migrationBuilder.DropIndex(
                name: "IX_Fingerprints_DoorId_Slot",
                table: "Fingerprints");

            migrationBuilder.DropIndex(
                name: "IX_DeviceCommands_DoorId_Status_CreatedAt",
                table: "DeviceCommands");

            migrationBuilder.DropColumn(
                name: "DoorId",
                table: "Fingerprints");

            migrationBuilder.DropColumn(
                name: "DoorId",
                table: "DeviceCommands");

            migrationBuilder.DropColumn(
                name: "DoorId",
                table: "AccessEvents");

            migrationBuilder.DropColumn(
                name: "DoorName",
                table: "AccessEvents");

            migrationBuilder.CreateTable(
                name: "DoorSettings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false),
                    PinHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    PinSalt = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    PinUpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DoorSettings", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Fingerprints_Slot",
                table: "Fingerprints",
                column: "Slot",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_DeviceCommands_Status_CreatedAt",
                table: "DeviceCommands",
                columns: new[] { "Status", "CreatedAt" });
        }
    }
}
