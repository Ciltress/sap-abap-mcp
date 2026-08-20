# Time, date and calendar

One topic from the *Released ABAP Classes* cheat sheet; the rest are listed in this skill's SKILL.md.
A class appearing here is not proof it exists on your system - release state is per system and per
release. `readAbapObject` returning the object is the proof.

## Contents

- Time and Date
- Calendar-Related Information

---

## Time and Date

> [!NOTE] 
> In [ABAP for Cloud Development](https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/index.htm?file=abenabap_for_cloud_dev_glosry.htm), do not use the date and time-related system fields such as `sy-datum` and `sy-uzeit`, and others. User-related time and date values can be retrieved using the XCO library. For code snippets, see the [Date, Time, and Time Stamp](23_Date_and_Time.md) cheat sheet.

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>

<tr>
<td> <code>CL_ABAP_CONTEXT_INFO</code> </td>
<td>
Provides context information relevant to the current ABAP session.
<br><br>

``` abap
"Getting the current date in UTC (not the system or user time), e.g. 20240101
DATA(sys_date) = cl_abap_context_info=>get_system_date( ).

"Getting the current time in UTC, e.g. 152450
DATA(sys_time) = cl_abap_context_info=>get_system_time( ).
``` 

</td>
</tr>
<tr>
<td> <code>CL_ABAP_DATFM</code> </td>
<td>
For conversions between the external and the internal representation of a date specification

<br><br>

``` abap
DATA(date4conversion) = CONV d( '20240202' ).
DATA conv_date_str TYPE string.
DATA conv_date_d TYPE d.
DATA date_format TYPE cl_abap_datfm=>ty_datfm.

"Conversion of d (internal) to string (external time format)
TRY.
    cl_abap_datfm=>conv_date_int_to_ext(
      EXPORTING im_datint    = date4conversion
                im_datfmdes  = cl_abap_datfm=>get_datfm( )
      IMPORTING ex_datext    = conv_date_str
                ex_datfmused = date_format ).
  CATCH cx_abap_datfm_format_unknown.
ENDTRY.

"Conversion of string (external) to d (internal time format)
TRY.
    cl_abap_datfm=>conv_date_ext_to_int(
      EXPORTING im_datext    = conv_date_str
                im_datfmdes  = date_format
      IMPORTING ex_datint    = conv_date_d
                ex_datfmused = date_format ).
  CATCH cx_abap_datfm_no_date cx_abap_datfm_invalid_date
        cx_abap_datfm_format_unknown cx_abap_datfm_ambiguous.
ENDTRY.
``` 

</td>
</tr>

<tr>
<td> <code>CL_ABAP_TIMEFM</code> </td>
<td>
For conversions between the external and the internal representation of a time specification

<br><br>

``` abap
DATA(time4conversion) = CONV t( '123456' ).
DATA conv_time_str TYPE string.
DATA conv_time_t TYPE t.

"Conversion of t (internal) to string (external time format)
TRY.
    cl_abap_timefm=>conv_time_int_to_ext(
      EXPORTING time_int            = time4conversion
                without_seconds     = abap_false
                format_according_to = cl_abap_timefm=>iso
      IMPORTING time_ext            = conv_time_str ).
  CATCH cx_parameter_invalid_range.
ENDTRY.

"Conversion of string (external) to t (internal time format)
TRY.
    cl_abap_timefm=>conv_time_ext_to_int(
      EXPORTING time_ext            = conv_time_str
      IMPORTING time_int            = conv_time_t ).
  CATCH cx_abap_timefm_invalid.
ENDTRY.
``` 

</td>
</tr>


<tr>
<td> <code>CL_ABAP_UTCLONG</code> </td>
<td>
For handling time stamps in time stamp fields (data objects with type <code>utclong</code>).
<br><br>

``` abap
"utclong_current: Using the built-in function to create a UTC time stamp
DATA(low_timestamp)  = utclong_current( ).
"utclong_add: Using the built-in function to create a UTC time stamp and
"adding time values
DATA(high_timestamp) = utclong_add( val     = low_timestamp
                                    days    = 1
                                    hours   = 2
                                    minutes = 3
                                    seconds = 4 ).

"diff: Calculating time differences
"In the example, the returned values correspond to the ones added above.
cl_abap_utclong=>diff( EXPORTING high     = high_timestamp
                                 low      = low_timestamp
                       IMPORTING days    = DATA(days)
                                 hours   = DATA(hours)
                                 minutes = DATA(minutes)
                                 seconds = DATA(seconds) ).

"read: Reading a time stamp from a string
DATA(ts) = |{ utclong_current( ) TIMESTAMP = ENVIRONMENT TIMEZONE = 'UTC' }|.

TRY.

    cl_abap_utclong=>read( EXPORTING string   = ts
                                     timezone = 'UTC'
                           IMPORTING value    = DATA(utc_ts) ).
    CATCH cx_abap_utclong_invalid.
ENDTRY.
"e.g. 2024-01-01T13:01:54.546134Z
``` 

</td>
</tr>

<tr>
<td> <code>CL_ABAP_TSTMP</code> </td>
<td>
For calculating and converting time stamps in packed numbers (types <code>timestamp</code> and <code>timestampl</code>)
<br><br>

``` abap
"Creating a time stamp of type timestamp (the inline creation creates 
"a data object with that type by default)
GET TIME STAMP FIELD DATA(ts1). 
"e.g. 20240101131220

"Calculations for time stamps in packed numbers
"Adding 1 hour
DATA(ts2) = cl_abap_tstmp=>add( tstmp = ts1
                                secs  = 3600 ).
"e.g. 20240101141220.0000000

"Subtracting 2 hours
DATA(ts3) = cl_abap_tstmp=>subtractsecs( tstmp = ts1
                                            secs  = 7200 ).
"e.g. 20240101111220.0000000

"Type timestampl
DATA tsl1 TYPE timestampl.
GET TIME STAMP FIELD tsl1.
"e.g. 20240101131701.3309040

"Converting type timestampl to timestamp
DATA(ts4) = cl_abap_tstmp=>move_to_short( tsl1 ).
"e.g. 20240101131701

"Converting types timestamp/timestampl to UTCLONG
DATA(ts2utcl) = cl_abap_tstmp=>tstmp2utclong( tsl1 ).
"e.g. 2024-01-01 13:19:23.8622560

"Converting type utclong to timestamp
DATA(utcl2ts) = cl_abap_tstmp=>utclong2tstmp_short( ts2utcl ).
"e.g. 20240101132231

"Converting type utclong to timestampl
DATA(utcl2tsl) = cl_abap_tstmp=>utclong2tstmp( ts2utcl ).
"e.g. 20240101132231.0667200
``` 

</td>
</tr>


<tr>
<td> <code>XCO_CP_TIME</code><br><code>XCO_CP</code> </td>
<td>
Class of the XCO time library that provides abstractions for getting and working with date and time information. Find more details <a href="https://help.sap.com/docs/btp/sap-business-technology-platform/time-library">here</a>. 
<br><br>

``` abap
"Creating a time stamp
"As a result (which is also true for other results below),
"you get a handler with which you can get further information
"(check the options following '->').
DATA(m_moment) = xco_cp_time=>moment(
  iv_year   = '2024'
  iv_month  = '01'
  iv_day    = '01'
  iv_hour   = '12'
  iv_minute = '34'
  iv_second = '55' ).

"Getting the created time stamp as a string
"20240101123455
DATA(m2_moment_string) = m_moment->as( xco_cp_time=>format->abap )->value.
"... and with other formats applied.
"20240101T123455
DATA(m3_moment_format_a) = m_moment->as( xco_cp_time=>format->iso_8601_basic )->value.
"2024-01-01T12:34:55
DATA(m4_moment_format_b) = m_moment->as( xco_cp_time=>format->iso_8601_extended )->value.

"Getting user time zone
"e.g. UTC
DATA(m1_user_time_zone) = xco_cp_time=>time_zone->user->value.

"Getting the current moment in the time zone of the current user
"e.g. 2024-01-01T08:54:39
DATA(m5_cur_moment4user) = xco_cp=>sy->moment( xco_cp_time=>time_zone->user )->as( xco_cp_time=>format->iso_8601_extended )->value.
"Current moment in UTC
"e.g. 2024-01-01T08:54:39 (result is the same as above in the case of the cheat sheet example)
DATA(m6_cur_moment_utc) = xco_cp=>sy->moment( xco_cp_time=>time_zone->utc )->as( xco_cp_time=>format->iso_8601_extended )->value.
"Current UNIX timestamp
"e.g. 1703863291
DATA(m7_unix_tstmp) = xco_cp=>sy->unix_timestamp( )->value.

"For the time stamp, you can also use the TIME method
"e.g. 10:27:59
DATA(m8_time) = xco_cp=>sy->time( xco_cp_time=>time_zone->user )->as( xco_cp_time=>format->iso_8601_extended )->value.
"Getting second, minute, hour information
"e.g. 59
DATA(m9_seconds) = xco_cp=>sy->time( xco_cp_time=>time_zone->user )->second.
"e.g. 27
DATA(m10_minutes) = xco_cp=>sy->time( xco_cp_time=>time_zone->user )->minute.
"e.g. 10
DATA(m11_hours) = xco_cp=>sy->time( xco_cp_time=>time_zone->user )->hour.
"Calculations with time
"Adding
"e.g. 11:29:00
DATA(m12_add_time) = xco_cp=>sy->time( xco_cp_time=>time_zone->user )->add( iv_hour = 1 iv_minute = 1 iv_second = 1 )->as( xco_cp_time=>format->iso_8601_extended )->value.
"Subtracting
"e.g. 09:26:58
DATA(m13_subtract_time) = xco_cp=>sy->time( xco_cp_time=>time_zone->user )->subtract( iv_hour = 1 iv_minute = 1 iv_second = 1 )->as( xco_cp_time=>format->iso_8601_extended )->value.

"Getting date information
"e.g. 2024-01-01
DATA(m14_date) = xco_cp=>sy->date( )->as( xco_cp_time=>format->iso_8601_extended )->value.
"e.g. 01
DATA(m15_day) = xco_cp=>sy->date( )->day.
"e.g. 01
DATA(m16_month) = xco_cp=>sy->date( )->month.
"e.g. 2024
DATA(m17_year) = xco_cp=>sy->date( )->year.
"Calculations with dates
"Adding
"e.g. 2025-02-02
DATA(m18_add_date) = xco_cp=>sy->date( )->add( iv_day = 1 iv_month = 1 iv_year = 1 )->as( xco_cp_time=>format->iso_8601_extended )->value.
"Subtracting
"e.g. 2022-12-31
DATA(m19_subtract_date) = xco_cp=>sy->date( )->subtract( iv_day = 1 iv_month = 1 iv_year = 1 )->as( xco_cp_time=>format->iso_8601_extended )->value.
``` 

</td>
</tr>
</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>

## Calendar-Related Information

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>
<tr>
<td> <code>CL_FHC_CALENDAR_RUNTIME</code> </td>
<td>

The following example explores accessing calendar-related information (factory and holiday calendars). Find more information in the [SAP Help Portal documentation](https://help.sap.com/docs/BTP/65de2977205c403bbc107264b8eccf4b/f7cbd3c336f84dc09c85639c55b4309f.html?version=Cloud). Note the [released CDS views](https://help.sap.com/docs/BTP/65de2977205c403bbc107264b8eccf4b/cc36b142349f40c499155b65e812c3ac.html?version=Cloud) in that context.


``` abap
SELECT FactoryCalendarID
  FROM I_FactoryCalendarBasic
  ORDER BY FactoryCalendarID
  INTO TABLE @DATA(factory_cal_ids).

SELECT PublicHolidayCalendarID
  FROM I_PublicHolidayCalendarBasic
  ORDER BY PublicHolidayCalendarID
  INTO TABLE @DATA(public_holiday_cal_ids).

DATA(example_cal_ids) = VALUE string_table( ( `SAP_US` ) ( `SAP_IN` ) ( `SAP_QA` )
                                            ( `SAP_SA` ) ( `SAP_DE_BW` ) ).

LOOP AT example_cal_ids INTO DATA(example_cal_id).

  IF line_exists( factory_cal_ids[ table_line = example_cal_id ] ).
    DATA(factory_calendar_id) = CONV cl_fhc_calendar_runtime=>ty_fcal_id( example_cal_id ).
  ELSE.
    CLEAR factory_calendar_id.
  ENDIF.

  IF line_exists( public_holiday_cal_ids[ table_line = example_cal_id ] ).
    DATA(holiday_calendar_id) = CONV cl_fhc_calendar_runtime=>ty_hcal_id( example_cal_id ).
  ELSE.
    CLEAR holiday_calendar_id.
  ENDIF.

  "---------------------- Factory calendar-related information ----------------------
  TRY.
      DATA(factory_cal) = cl_fhc_calendar_runtime=>create_factorycalendar_runtime( iv_factorycalendar_id = factory_calendar_id ).
      DATA(fc_date_conv) = factory_cal->convert_date_to_factorydate( CONV d( '20241115' ) ).
      DATA(fc_factory_date_conv) = factory_cal->convert_factorydate_to_date( 7219 ).
      DATA(fc_last_factory_date) = factory_cal->get_last_factorydate( ).
      DATA(fc_days_between) = factory_cal->calc_workingdays_between_dates( iv_start = '20241201'
                                                                            iv_end = '20250101'  ).
      DATA(fc_days_add) = factory_cal->add_workingdays_to_date( iv_start = '20241220'
                                                                iv_number_of_workingdays  = 5  ).
      DATA(fc_days_subtract) = factory_cal->subtract_workingdays_from_date( iv_start = '20250101'
                                                                            iv_number_of_workingdays  = 5  ).
      DATA(fc_is_working_date_1) = factory_cal->is_date_workingday( '20250101' ).
      DATA(fc_is_working_date_2) = factory_cal->is_date_workingday( '20241231' ).
      DATA(fc_description) = factory_cal->get_description( ).
      DATA(fc_id) = factory_cal->get_id( ).
    CATCH cx_fhc_runtime INTO DATA(error_factory_cal).
      DATA(error_msg_factory_cal) = error_factory_cal->get_text( ).
  ENDTRY.

  "---------------------- Holiday calendar-related information ----------------------
  TRY.
      DATA(holiday_cal) = cl_fhc_calendar_runtime=>create_holidaycalendar_runtime( iv_holidaycalendar_id = holiday_calendar_id ).
      DATA(hc_is_holiday) = holiday_cal->is_holiday( CONV d( '20250101' ) ).
      holiday_cal->calc_holidays_between_dates(
        EXPORTING
          iv_start = '20240101'
          iv_end = '20250101'
        IMPORTING
          et_holidays = DATA(hc_holidays_between)
      ).
      DATA(hc_val_start) = holiday_cal->get_validity_start( ).
      DATA(hc_val_end) = holiday_cal->get_validity_end( ).
      DATA(hc_description) = holiday_cal->get_description( ).
      DATA(hc_id) = holiday_cal->get_id( ).
      DATA(hc_holiday_assignm) = holiday_cal->get_holiday_assignments( ).

      DATA holidays TYPE string_table.
      LOOP AT hc_holiday_assignm INTO DATA(holiday_wa).
        APPEND |Holiday ID: "{ holiday_wa->get_holiday_id( ) }", "{ holiday_wa->get_text( )-description }"| TO holidays.
      ENDLOOP.

      DATA holidays_in_time_frame TYPE string_table.
      LOOP AT hc_holidays_between INTO DATA(holiday_info_wa).
        DATA(hc_get_holiday) = holiday_cal->get_holiday( holiday_info_wa-date ).
        DATA(hc_holiday_text) = hc_get_holiday->get_text( ).
        DATA(hc_holiday_class) = hc_get_holiday->get_class( ).
        DATA(hc_holiday_conf) = hc_get_holiday->get_confession( ).
        DATA(hc_holiday_type) = hc_get_holiday->get_type( ).
        DATA(hc_holiday_id) = hc_get_holiday->get_holiday_id( ).
        APPEND |Date "{ holiday_info_wa-date }", Title "{ hc_holiday_text-description }"| TO holidays_in_time_frame.
      ENDLOOP.
    CATCH cx_fhc_runtime INTO DATA(error_holiday_cal).
      DATA(error_msg_holidays_cal) = error_holiday_cal->get_text( ).
  ENDTRY.
  CLEAR: holidays, holidays_in_time_frame.
ENDLOOP.
``` 

</td>
</tr>
<tr>
<td> <code>CL_SCAL_UTILS</code> </td>
<td>
Calendar utilities for getting month names, year and week of a date, first day of a week, name and number of the weekday for a specified date


``` abap
TRY.
  "Getting month names
  cl_scal_utils=>month_names_get(
    EXPORTING
      iv_language    = sy-langu
    IMPORTING
      et_month_names = DATA(months)
      ev_returncode  = DATA(return_code)
  ).

  DATA(month_names) = VALUE string_table( FOR wa IN months ( CONV string( wa-ltx ) ) ).

  "Getting year and week of a date
  cl_scal_utils=>date_get_week(
    EXPORTING
      iv_date = '20251201'
    IMPORTING
      ev_year = DATA(year)
      ev_week = DATA(week) ).

  "Getting the first day of a week
  "Note the class documentation
  cl_scal_utils=>week_get_first_day(
    EXPORTING
      iv_year_week = 0
      iv_year      = 2025
      iv_week      = 48
    IMPORTING
      ev_date      = DATA(date)
  ).

  "Getting the name and number of the weekday for a specified date
  cl_scal_utils=>date_compute_day(
    EXPORTING
      iv_date           = '20251201'
    IMPORTING
      ev_weekday_number = DATA(day_number)
      ev_weekday_name   = DATA(day_name)
  ).

CATCH cx_scal INTO DATA(error_scal).
  DATA(error_msg_scal) = error_scal->get_text( ).
ENDTRY.
``` 

</td>
</tr>
</table>


<p align="right"><a href="#top">⬆️ back to top</a></p>
