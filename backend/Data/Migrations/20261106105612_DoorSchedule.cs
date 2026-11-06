using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmartDoor.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class DoorSchedule : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ScheduleDays",
                table: "Doors",
                type: "integer",
                nullable: false,
                defaultValue: 31);

            migrationBuilder.AddColumn<bool>(
                name: "ScheduleEnabled",
                table: "Doors",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "ScheduleFromMinutes",
                table: "Doors",
                type: "integer",
                nullable: false,
                defaultValue: 420);

            migrationBuilder.AddColumn<int>(
                name: "ScheduleUntilMinutes",
                table: "Doors",
                type: "integer",
                nullable: false,
                defaultValue: 1140);

            migrationBuilder.AddColumn<int>(
                name: "ScheduleUtcOffsetMinutes",
                table: "Doors",
                type: "integer",
                nullable: false,
                defaultValue: 480);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ScheduleDays",
                table: "Doors");

            migrationBuilder.DropColumn(
                name: "ScheduleEnabled",
                table: "Doors");

            migrationBuilder.DropColumn(
                name: "ScheduleFromMinutes",
                table: "Doors");

            migrationBuilder.DropColumn(
                name: "ScheduleUntilMinutes",
                table: "Doors");

            migrationBuilder.DropColumn(
                name: "ScheduleUtcOffsetMinutes",
                table: "Doors");
        }
    }
}
