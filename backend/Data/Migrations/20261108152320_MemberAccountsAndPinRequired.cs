using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmartDoor.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class MemberAccountsAndPinRequired : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "AccountCreatedAt",
                table: "Members",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LastLoginAt",
                table: "Members",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PasswordHash",
                table: "Members",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PasswordHint",
                table: "Members",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Username",
                table: "Members",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "PinRequired",
                table: "Doors",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.CreateIndex(
                name: "IX_Members_Username",
                table: "Members",
                column: "Username",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Members_Username",
                table: "Members");

            migrationBuilder.DropColumn(
                name: "AccountCreatedAt",
                table: "Members");

            migrationBuilder.DropColumn(
                name: "LastLoginAt",
                table: "Members");

            migrationBuilder.DropColumn(
                name: "PasswordHash",
                table: "Members");

            migrationBuilder.DropColumn(
                name: "PasswordHint",
                table: "Members");

            migrationBuilder.DropColumn(
                name: "Username",
                table: "Members");

            migrationBuilder.DropColumn(
                name: "PinRequired",
                table: "Doors");
        }
    }
}
