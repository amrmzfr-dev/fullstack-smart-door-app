using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmartDoor.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class DoorGeofence : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "GeofenceEnabled",
                table: "Doors",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<double>(
                name: "GeofenceLatitude",
                table: "Doors",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "GeofenceLongitude",
                table: "Doors",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "GeofenceRadiusMeters",
                table: "Doors",
                type: "integer",
                nullable: false,
                defaultValue: 100);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "GeofenceEnabled",
                table: "Doors");

            migrationBuilder.DropColumn(
                name: "GeofenceLatitude",
                table: "Doors");

            migrationBuilder.DropColumn(
                name: "GeofenceLongitude",
                table: "Doors");

            migrationBuilder.DropColumn(
                name: "GeofenceRadiusMeters",
                table: "Doors");
        }
    }
}
