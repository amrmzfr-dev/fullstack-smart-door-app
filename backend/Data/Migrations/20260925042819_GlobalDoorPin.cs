using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmartDoor.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class GlobalDoorPin : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PinHash",
                table: "Members");

            migrationBuilder.DropColumn(
                name: "PinSalt",
                table: "Members");

            migrationBuilder.CreateTable(
                name: "DoorSettings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false),
                    PinSalt = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    PinHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    PinUpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DoorSettings", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DoorSettings");

            migrationBuilder.AddColumn<string>(
                name: "PinHash",
                table: "Members",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PinSalt",
                table: "Members",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);
        }
    }
}
